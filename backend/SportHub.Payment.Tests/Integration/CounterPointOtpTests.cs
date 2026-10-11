using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Application;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CounterPointOtpTests(PaymentApiFactory factory)
{
    private async Task<(Guid MemberId, string Email, Guid ReceptionistId, Guid InvoiceId)> SetupAsync(int balance = 100)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            await scope.ServiceProvider.GetRequiredService<IPointWalletService>()
                .EarnAsync(new(member.UserId, balance, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var invoice = await NewCheckoutInvoiceAsync(member.UserId, receptionist.UserId);
        return (member.UserId, member.Email, receptionist.UserId, invoice);
    }

    private async Task<Guid> NewCheckoutInvoiceAsync(Guid memberId, Guid actorId)
    {
        var invoice = await factory.SeedInvoiceAsync(memberId, actorId, 100_000m);
        await factory.QueryAsync(async db =>
        {
            var row = await db.Invoices.SingleAsync(x => x.InvoiceId == invoice.InvoiceId);
            row.CheckoutCycleId = Guid.NewGuid();
            row.CheckoutRevision = 1;
            row.HoldExpiresAtUtc = DateTime.UtcNow.AddMinutes(15);
            row.CashAmount = row.TotalAmount;
            await db.SaveChangesAsync();
            return 0;
        });
        return invoice.InvoiceId;
    }

    private async Task<Guid> RequestAsync(HttpClient client, Guid invoiceId, Guid memberId, int points)
    {
        var selection = await client.GetFromJsonAsync<PointSelectionResponse>($"/api/invoices/{invoiceId}/point-selection");
        var response = await client.PostAsJsonAsync($"/api/invoices/{invoiceId}/point-confirmations",
            new { memberId, points, revision = selection!.Revision });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PointConfirmationResponse>())!.ConfirmationId;
    }

    private Task<HttpResponseMessage> VerifyAsync(HttpClient client, Guid id, string code)
        => client.PostAsJsonAsync($"/api/point-confirmations/{id}/verify", new { code });

    [Fact]
    public async Task Pending_counter_confirmation_is_resumable_and_blocks_gateway_payment_without_leaking_code()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var confirmationId = await RequestAsync(counter, context.InvoiceId, context.MemberId, 20);
        var read = await counter.GetAsync($"/api/invoices/{context.InvoiceId}/point-confirmations/current");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        var body = await read.Content.ReadAsStringAsync();
        Assert.Contains(confirmationId.ToString(), body);
        Assert.DoesNotContain("codeHash", body);
        Assert.DoesNotContain("codeSalt", body);
        Assert.DoesNotContain(factory.CapturedEmail.CodeFor(context.Email), body);
        Assert.Equal(HttpStatusCode.Conflict, (await counter.PostAsync($"/api/checkouts/{context.InvoiceId}/attempts", null)).StatusCode);
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/invoices/{context.InvoiceId}/point-confirmations/current")).StatusCode);
    }

    [Fact]
    public async Task Read_all_in_app_does_not_mark_encrypted_email_otp_as_read()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        await RequestAsync(counter, context.InvoiceId, context.MemberId, 20);
        var code = factory.CapturedEmail.CodeFor(context.Email);

        var outbox = await factory.QueryAsync(db => db.Notifications
            .SingleAsync(n => n.Channel == NotificationChannel.Email && n.RecipientAddress == context.Email));
        Assert.Equal(NotificationStatus.Pending, outbox.Status);
        Assert.NotNull(outbox.ProtectedEmailPayload);
        Assert.DoesNotContain(code, outbox.ProtectedEmailPayload, StringComparison.Ordinal);

        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync("/api/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.PostAsync("/api/notifications/read-all", null)).StatusCode);

        Assert.Equal(NotificationStatus.Pending, await factory.QueryAsync(db => db.Notifications
            .Where(n => n.NotificationId == outbox.NotificationId).Select(n => n.Status).SingleAsync()));
    }

    [Fact]
    public async Task Wrong_code_is_committed_five_times_and_cannot_hold_points()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var id = await RequestAsync(counter, context.InvoiceId, context.MemberId, 40);
        var code = factory.CapturedEmail.CodeFor(context.Email);
        var wrong = code == "000000" ? "999999" : "000000";
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await VerifyAsync(counter, id, wrong)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await VerifyAsync(counter, id, code)).StatusCode);
        Assert.Equal(5, await factory.QueryAsync(db => db.PointConfirmations
            .Where(x => x.PointConfirmationId == id).Select(x => x.FailedAttempts).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
    }

    [Fact]
    public async Task Confirm_is_idempotent_and_changing_points_releases_previous_hold()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var firstId = await RequestAsync(counter, context.InvoiceId, context.MemberId, 40);
        var firstCode = factory.CapturedEmail.CodeFor(context.Email);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, firstId, firstCode)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, firstId, firstCode)).StatusCode);
        Assert.Equal(40, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
        Assert.Equal(60_000m, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == context.InvoiceId).Select(x => x.CashAmount).SingleAsync()));

        var secondId = await RequestAsync(counter, context.InvoiceId, context.MemberId, 20);
        Assert.Equal(HttpStatusCode.Conflict, (await VerifyAsync(counter, firstId, firstCode)).StatusCode);
        var secondCode = factory.CapturedEmail.CodeFor(context.Email);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, secondId, secondCode)).StatusCode);
        Assert.Equal(20, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
        Assert.Equal(3, await factory.QueryAsync(db => db.PointLedgerEntries
            .CountAsync(x => x.ReferenceType == "CheckoutSession" && x.WalletId == db.PointWallets
                .Where(w => w.OwnerUserId == context.MemberId).Select(w => w.WalletId).Single())));
    }

    [Fact]
    public async Task Expired_code_and_checkout_release_do_not_leave_points_held()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var id = await RequestAsync(counter, context.InvoiceId, context.MemberId, 50);
        var code = factory.CapturedEmail.CodeFor(context.Email);
        await factory.QueryAsync(async db =>
        {
            await db.PointConfirmations.Where(x => x.PointConfirmationId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        Assert.Equal(HttpStatusCode.Conflict, (await VerifyAsync(counter, id, code)).StatusCode);

        var replacement = await RequestAsync(counter, context.InvoiceId, context.MemberId, 40);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, replacement, factory.CapturedEmail.CodeFor(context.Email))).StatusCode);
        await factory.QueryAsync(async db =>
        {
            await db.Invoices.Where(x => x.InvoiceId == context.InvoiceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        // The worker processes all expired invoices in the shared fixture DB.
        Assert.True(await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().ReleaseExpiredAsync(default) >= 1);
        Assert.Equal(0, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == context.InvoiceId).Select(x => x.PointsApplied).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
    }

    [Fact]
    public async Task Counter_roles_and_invoice_ownership_are_enforced()
    {
        var context = await SetupAsync();
        var other = await factory.SeedUserAsync(UserRole.Member);
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.CenterManager)).UserId, UserRole.CenterManager);
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var path = $"/api/invoices/{context.InvoiceId}/point-confirmations";
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync(path, new { memberId = context.MemberId, points = 10 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PostAsJsonAsync(path, new { memberId = context.MemberId, points = 10 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await counter.PostAsJsonAsync(path, new { memberId = other.UserId, points = 10, revision = 1 })).StatusCode);
        using var otherClient = factory.CreateApiClient(other.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherClient.PostAsJsonAsync(
            $"/api/wallet/me/checkouts/{context.InvoiceId}/points", new { points = 10 })).StatusCode);
    }

    [Fact]
    public async Task Two_invoices_cannot_hold_more_than_available_points()
    {
        var context = await SetupAsync();
        var secondInvoice = await NewCheckoutInvoiceAsync(context.MemberId, context.ReceptionistId);
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var first = member.PostAsJsonAsync($"/api/wallet/me/checkouts/{context.InvoiceId}/points", new { points = 80 });
        var second = member.PostAsJsonAsync($"/api/wallet/me/checkouts/{secondInvoice}/points", new { points = 80 });
        var results = await Task.WhenAll(first, second);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Equal(80, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
    }

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = DateTime.UtcNow;
    }

    private async Task<T> AtTime<T>(IClock clock, Func<PointConfirmationService, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        return await action(ActivatorUtilities.CreateInstance<PointConfirmationService>(scope.ServiceProvider, clock));
    }

    [Fact]
    public async Task Resend_at_sixty_seconds_invalidates_old_code_and_expires_at_five_minutes()
    {
        var context = await SetupAsync();
        var clock = new TestClock();
        var originalDeadline = await factory.QueryAsync(db => db.Invoices.Where(x => x.InvoiceId == context.InvoiceId)
            .Select(x => x.HoldExpiresAtUtc).SingleAsync());
        var first = await AtTime(clock, s => s.RequestAsync(context.InvoiceId, context.MemberId, 30, 1, context.ReceptionistId, default));
        var firstCode = factory.CapturedEmail.CodeFor(context.Email);
        Assert.Equal(clock.UtcNow.AddMinutes(5), first.ExpiresAtUtc);
        clock.UtcNow = clock.UtcNow.AddSeconds(59);
        var cooldown = await Assert.ThrowsAsync<ConflictException>(() => AtTime(clock, s =>
            s.RequestAsync(context.InvoiceId, context.MemberId, 30, first.Revision, context.ReceptionistId, default)));
        Assert.Equal("point_confirmation_cooldown", cooldown.ErrorCode);
        clock.UtcNow = clock.UtcNow.AddSeconds(1);
        var second = await AtTime(clock, s => s.RequestAsync(context.InvoiceId, context.MemberId, 30, first.Revision,
            context.ReceptionistId, default));
        var secondCode = factory.CapturedEmail.CodeFor(context.Email);
        Assert.Equal(originalDeadline, second.HoldExpiresAtUtc);
        await Assert.ThrowsAsync<ConflictException>(() => AtTime(clock, s => s.VerifyAsync(first.ConfirmationId, firstCode,
            context.ReceptionistId, default)));
        clock.UtcNow = second.ExpiresAtUtc;
        var expired = await Assert.ThrowsAsync<ConflictException>(() => AtTime(clock, s => s.VerifyAsync(second.ConfirmationId,
            secondCode, context.ReceptionistId, default)));
        Assert.Equal("point_confirmation_expired", expired.ErrorCode);
    }

    [Fact]
    public async Task Concurrent_correct_codes_hold_once_and_wrong_attempts_stop_at_five()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var id = await RequestAsync(counter, context.InvoiceId, context.MemberId, 25);
        var code = factory.CapturedEmail.CodeFor(context.Email);
        var responses = await Task.WhenAll(VerifyAsync(counter, id, code), VerifyAsync(counter, id, code));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(25, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == context.MemberId)
            .Select(w => w.HeldPoints).SingleAsync()));

        var other = await SetupAsync();
        using var otherCounter = factory.CreateApiClient(other.ReceptionistId, UserRole.Receptionist);
        var otherId = await RequestAsync(otherCounter, other.InvoiceId, other.MemberId, 25);
        var otherCode = factory.CapturedEmail.CodeFor(other.Email);
        var wrong = otherCode == "000000" ? "999999" : "000000";
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => VerifyAsync(otherCounter, otherId, wrong)));
        Assert.Equal(5, await factory.QueryAsync(db => db.PointConfirmations.Where(x => x.PointConfirmationId == otherId)
            .Select(x => x.FailedAttempts).SingleAsync()));
        Assert.Equal(HttpStatusCode.Conflict, (await VerifyAsync(otherCounter, otherId, otherCode)).StatusCode);
    }

    [Fact]
    public async Task Stale_revision_and_old_manual_payment_cannot_bypass_point_selection()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var id = await RequestAsync(counter, context.InvoiceId, context.MemberId, 50);
        Assert.Equal(HttpStatusCode.Conflict, (await counter.PostAsJsonAsync(
            $"/api/invoices/{context.InvoiceId}/point-confirmations", new { memberId = context.MemberId, points = 20, revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await counter.PostAsJsonAsync(
            $"/api/invoices/{context.InvoiceId}/payments", new { amount = 100_000, method = "Cash" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, id, factory.CapturedEmail.CodeFor(context.Email))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await counter.PostAsJsonAsync(
            $"/api/invoices/{context.InvoiceId}/payments", new { amount = 100_000, method = "Cash" })).StatusCode);
        var state = await counter.GetFromJsonAsync<PointSelectionResponse>($"/api/invoices/{context.InvoiceId}/point-selection");
        Assert.Equal(HttpStatusCode.OK, (await counter.PostAsJsonAsync(
            $"/api/invoices/{context.InvoiceId}/point-confirmations/clear", new { memberId = context.MemberId, revision = state!.Revision })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await VerifyAsync(counter, id, factory.CapturedEmail.CodeFor(context.Email))).StatusCode);
        Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == context.MemberId)
            .Select(w => w.AvailablePoints).SingleAsync()));
    }

    private sealed class FailingAuditWriter : IAuditWriter
    {
        public void Write(AuditEntry entry) => throw new InvalidOperationException("Injected audit failure after Hold");
    }

    [Fact]
    public async Task Failure_after_hold_rolls_back_wallet_invoice_and_otp_together()
    {
        var context = await SetupAsync();
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var id = await RequestAsync(counter, context.InvoiceId, context.MemberId, 50);
        using (var scope = factory.Services.CreateScope())
        {
            var service = ActivatorUtilities.CreateInstance<PointConfirmationService>(scope.ServiceProvider, new FailingAuditWriter());
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.VerifyAsync(id,
                factory.CapturedEmail.CodeFor(context.Email), context.ReceptionistId, default));
        }
        Assert.Null(await factory.QueryAsync(db => db.PointConfirmations.Where(x => x.PointConfirmationId == id)
            .Select(x => x.ConsumedAtUtc).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.Invoices.Where(x => x.InvoiceId == context.InvoiceId)
            .Select(x => x.PointsApplied).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == context.MemberId)
            .Select(w => w.HeldPoints).SingleAsync()));
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(counter, id, factory.CapturedEmail.CodeFor(context.Email))).StatusCode);
    }

    [Fact]
    public async Task Large_point_amount_uses_decimal_cash_without_integer_overflow()
    {
        var context = await SetupAsync(3_000_000);
        await factory.QueryAsync(async db =>
        {
            await db.Invoices.Where(x => x.InvoiceId == context.InvoiceId).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.TotalAmount, 4_000_000_000m).SetProperty(x => x.CashAmount, 4_000_000_000m));
            return 0;
        });
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var response = await member.PostAsJsonAsync($"/api/wallet/me/checkouts/{context.InvoiceId}/points", new { points = 3_000_000 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1_000_000_000m, (await response.Content.ReadFromJsonAsync<PointSelectionResponse>())!.CashAmount);
    }

    [Fact]
    public async Task Migration_snapshot_matches_current_model()
    {
        await factory.QueryAsync(db =>
        {
            Assert.False(db.Database.HasPendingModelChanges());
            return Task.FromResult(0);
        });
    }
}
