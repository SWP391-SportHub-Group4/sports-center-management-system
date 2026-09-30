using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class PointConfirmationMigrationTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Upgrade_preserves_legacy_invoice_and_payment_and_backfills_cash_amount()
    {
        // A separate database in the test fixture's PostgreSQL server; disposed with its container.
        var databaseName = "p106_" + Guid.NewGuid().ToString("N");
        await using (var connection = new NpgsqlConnection(factory.ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", connection);
            await create.ExecuteNonQueryAsync();
        }
        var connectionString = new NpgsqlConnectionStringBuilder(factory.ConnectionString) { Database = databaseName }.ConnectionString;
        var options = new DbContextOptionsBuilder<SportHubDbContext>().UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention().Options;
        await using var db = new SportHubDbContext(options);
        await db.GetService<IMigrator>().MigrateAsync("20260930050350_MultiSportWallet");
        await db.Database.ExecuteSqlRawAsync("UPDATE system_settings SET value = '9' WHERE key = 'package_expiring_reminder_days'");
        var member = new UserAccount
        {
            UserId = Guid.NewGuid(), Email = "member@migration.test", Status = UserStatus.Active,
            RoleId = await db.Roles.Where(x => x.RoleName == UserRole.Member).Select(x => x.RoleId).SingleAsync(),
            CreatedAt = DateTime.UtcNow
        };
        var receptionist = new UserAccount
        {
            UserId = Guid.NewGuid(), Email = "counter@migration.test", Status = UserStatus.Active,
            RoleId = await db.Roles.Where(x => x.RoleName == UserRole.Receptionist).Select(x => x.RoleId).SingleAsync(),
            CreatedAt = DateTime.UtcNow
        };
        db.UserAccounts.AddRange(member, receptionist);
        await db.SaveChangesAsync();
        var invoiceId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO invoices (invoice_id, invoice_number, member_id, issued_by_user_id, total_amount, status, issued_at)
            VALUES ({invoiceId}, 'P106-LEGACY', {member.UserId}, {receptionist.UserId}, 123000, 2, {now})
            """);
        var payment = new SportHub.Payment.Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(), InvoiceId = invoiceId, Amount = 123_000m,
            Method = PaymentMethod.Cash, Status = PaymentStatus.Success, ReceivedByUserId = receptionist.UserId, PaidAt = now
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        await db.Database.MigrateAsync();
        var invoice = await db.Invoices.AsNoTracking().SingleAsync(x => x.InvoiceId == invoiceId);
        Assert.Equal(123_000m, invoice.TotalAmount);
        Assert.Equal(123_000m, invoice.CashAmount);
        Assert.Equal(0, invoice.PointsApplied);
        Assert.Null(invoice.CheckoutCycleId);
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
        Assert.Equal(123_000m, await db.Payments.Where(x => x.PaymentId == payment.PaymentId).Select(x => x.Amount).SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Equal("9", await db.Set<SportHub.Administration.Domain.Entities.SystemSetting>()
            .Where(x => x.Key == "membership.expiry_notice_days").Select(x => x.Value).SingleAsync());
    }
}
