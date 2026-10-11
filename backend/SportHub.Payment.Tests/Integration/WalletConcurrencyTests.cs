using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class WalletConcurrencyTests(PaymentApiFactory factory)
{
    private async Task<T> InTransaction<T>(Func<IPointWalletService, Task<T>> action, bool commit = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        var result = await action(scope.ServiceProvider.GetRequiredService<IPointWalletService>());
        if (commit) await tx.CommitAsync();
        return result;
    }

    private async Task<Guid> FundedOwner(int points = 100)
    {
        var owner = (await factory.SeedUserAsync(UserRole.Member)).UserId;
        await InTransaction(w => w.EarnAsync(new(owner, points, "TestCredit", Guid.NewGuid())));
        return owner;
    }

    private Task<PointWallet> Balance(Guid owner) => factory.QueryAsync(db =>
        db.PointWallets.AsNoTracking().SingleAsync(x => x.OwnerUserId == owner));

    [Fact]
    public async Task Concurrent_holds_cannot_spend_the_same_balance()
    {
        var owner = await FundedOwner();
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<bool> Attempt()
        {
            await start.Task;
            try { await InTransaction(w => w.HoldAsync(new(owner, 80, "CheckoutSession", Guid.NewGuid()))); return true; }
            catch (InsufficientPointsException) { return false; }
        }
        var first = Attempt();
        var second = Attempt();
        start.SetResult();
        Assert.Single(await Task.WhenAll(first, second), x => x);
        var balance = await Balance(owner);
        Assert.Equal(20, balance.AvailablePoints);
        Assert.Equal(80, balance.HeldPoints);
    }

    [Fact]
    public async Task Concurrent_same_reference_is_applied_once_and_changed_payload_conflicts()
    {
        var owner = await FundedOwner();
        var op = new WalletOperation(owner, 20, "CheckoutSession", Guid.NewGuid());
        var results = await Task.WhenAll(InTransaction(w => w.HoldAsync(op)), InTransaction(w => w.HoldAsync(op)));
        Assert.Single(results, x => x.AlreadyApplied);
        Assert.Equal(results[0].LedgerEntryId, results[1].LedgerEntryId);
        await Assert.ThrowsAsync<WalletReferenceConflictException>(() => InTransaction(w => w.HoldAsync(op with { Points = 21 })));
        Assert.Equal(80, (await Balance(owner)).AvailablePoints);
    }

    [Fact]
    public async Task Hold_can_only_be_closed_by_its_own_reference_once()
    {
        var owner = await FundedOwner();
        var op = new WalletOperation(owner, 40, "CheckoutSession", Guid.NewGuid());
        await InTransaction(w => w.HoldAsync(op));
        await Assert.ThrowsAsync<ConflictException>(() => InTransaction(w => w.SpendAsync(op with { ReferenceId = Guid.NewGuid() })));
        await Assert.ThrowsAsync<ConflictException>(() => InTransaction(w => w.ReleaseAsync(op with { Points = 20 })));
        await InTransaction(w => w.SpendAsync(op));
        Assert.True((await InTransaction(w => w.SpendAsync(op))).AlreadyApplied);
        await Assert.ThrowsAsync<ConflictException>(() => InTransaction(w => w.ReleaseAsync(op)));
        var balance = await Balance(owner);
        Assert.Equal(60, balance.AvailablePoints);
        Assert.Equal(0, balance.HeldPoints);
    }

    [Fact]
    public async Task Released_cycle_can_be_retried_under_a_new_cycle_id()
    {
        var owner = await FundedOwner();
        var op = new WalletOperation(owner, 100, "CheckoutSession", Guid.NewGuid());
        await InTransaction(w => w.HoldAsync(op));
        await InTransaction(w => w.ReleaseAsync(op));
        Assert.True((await InTransaction(w => w.ReleaseAsync(op))).AlreadyApplied);
        await InTransaction(w => w.HoldAsync(op with { ReferenceId = Guid.NewGuid() }));
        var balance = await Balance(owner);
        Assert.Equal(0, balance.AvailablePoints);
        Assert.Equal(100, balance.HeldPoints);
    }

    [Fact]
    public async Task Failure_after_wallet_write_rolls_back_balance_and_ledger()
    {
        var owner = await FundedOwner();
        var reference = Guid.NewGuid();
        await Assert.ThrowsAsync<InvalidOperationException>(() => InTransaction<int>(async w =>
        {
            await w.HoldAsync(new(owner, 80, "CheckoutSession", reference));
            throw new InvalidOperationException("Injected fulfillment failure after wallet SaveChanges");
        }));
        Assert.Equal(100, (await Balance(owner)).AvailablePoints);
        Assert.False(await factory.QueryAsync(db => db.PointLedgerEntries.AnyAsync(x => x.ReferenceId == reference)));
    }

    [Fact]
    public async Task Adjustment_debit_does_not_take_held_points_and_is_idempotent()
    {
        var owner = await FundedOwner();
        var manager = (await factory.SeedUserAsync(UserRole.CenterManager)).UserId;
        await InTransaction(w => w.HoldAsync(new(owner, 80, "CheckoutSession", Guid.NewGuid())));
        var adjustment = new WalletAdjustment(owner, 21, WalletAdjustmentDirection.Debit, "ManagerAdjustment", Guid.NewGuid(), manager, "Correction");
        await Assert.ThrowsAsync<InsufficientPointsException>(() => InTransaction(w => w.AdjustAsync(adjustment)));
        adjustment = adjustment with { Points = 20 };
        await InTransaction(w => w.AdjustAsync(adjustment));
        Assert.True((await InTransaction(w => w.AdjustAsync(adjustment))).AlreadyApplied);
        await Assert.ThrowsAsync<WalletReferenceConflictException>(() => InTransaction(w => w.AdjustAsync(adjustment with { Direction = WalletAdjustmentDirection.Credit })));
        Assert.Equal(80, (await Balance(owner)).HeldPoints);
    }

    [Theory]
    [InlineData("UPDATE point_ledger_entries SET points = points WHERE wallet_id = {0}")]
    [InlineData("DELETE FROM point_ledger_entries WHERE wallet_id = {0}")]
    public async Task Ledger_is_append_only_at_database_level(string sql)
    {
        var owner = await FundedOwner();
        var wallet = await Balance(owner);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlRawAsync(sql, wallet.WalletId));
        Assert.Equal("23514", error.SqlState);
    }

    [Fact]
    public async Task Mutations_require_an_explicit_transaction()
    {
        using var scope = factory.Services.CreateScope();
        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<IPointWalletService>()
            .EarnAsync(new(Guid.NewGuid(), 10, "Credit", Guid.NewGuid())));
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Non_manager_cannot_adjust_points(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        using var client = factory.CreateApiClient(user.UserId, role);
        var response = await client.PostAsJsonAsync($"/api/wallets/{user.UserId}/adjustments",
            new { idempotencyKey = Guid.NewGuid(), points = 10, direction = "Credit", reason = "Test" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_read_another_members_wallet_and_counter_read_is_audited()
    {
        var owner = await FundedOwner();
        var other = await factory.SeedUserAsync(UserRole.Member);
        using var member = factory.CreateApiClient(other.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/members/{owner}/points")).StatusCode);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using var counter = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.OK, (await counter.GetAsync($"/api/members/{owner}/points")).StatusCode);
        Assert.True(await factory.QueryAsync(db => db.AuditLogs.AnyAsync(x => x.Action == "VIEW_MEMBER_WALLET" && x.TargetId == owner.ToString())));
    }
}
