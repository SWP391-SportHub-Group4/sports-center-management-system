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
    public async Task Upgrade_from_pre_multisport_preserves_accounts_roles_and_legacy_courses()
    {
        var name = "p1_upgrade_" + Guid.NewGuid().ToString("N");
        await using (var connection = new NpgsqlConnection(factory.ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
            await create.ExecuteNonQueryAsync();
        }
        var connectionString = new NpgsqlConnectionStringBuilder(factory.ConnectionString) { Database = name }.ConnectionString;
        await using var db = new SportHubDbContext(new DbContextOptionsBuilder<SportHubDbContext>()
            .UseNpgsql(connectionString).UseSnakeCaseNamingConvention().Options);
        await db.GetService<IMigrator>().MigrateAsync("20260929010712_AddPtTrainingDomain");
        var user = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO user_accounts (user_id, email, role_id, status, created_at)
            VALUES ({user}, 'before@multisport.test', 3, 0, {DateTime.UtcNow})
            """);
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO rooms (room_id, name, capacity) VALUES (991, 'Legacy room', 20);
            INSERT INTO classes (class_id, name, discipline, default_room_id, capacity, status)
            VALUES (991, 'Historical course', 'Yoga', 991, 20, 0);
            """);
        await db.Database.MigrateAsync();
        Assert.Equal(1, await db.Database.SqlQueryRaw<int>(
            "SELECT count(*)::int AS \"Value\" FROM legacy_classes WHERE class_id = 991 AND name = 'Historical course'").SingleAsync());
        Assert.False(await db.Classes.AnyAsync(x => x.ClassId == 991));
        var account = await db.UserAccounts.AsNoTracking().SingleAsync(x => x.UserId == user);
        Assert.Equal(3, account.RoleId);
        Assert.NotEqual(Guid.Empty, account.SecurityStamp);
        Assert.Equal(UserRole.Member, await db.Roles.Where(x => x.RoleId == 3).Select(x => x.RoleName).SingleAsync());
        Assert.False(await db.Roles.AnyAsync(x => x.RoleId == 6)); // BR-140: chỉ còn 5 role (RoleId 1-5)
        Assert.Equal(3, await db.Sports.CountAsync()); // Gym, Cầu lông, Bóng rổ; PT là dịch vụ của Gym
        Assert.True(await db.Rooms.Where(x => x.RoomId == 991).Select(x => x.IsActive).SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
    }

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
        var memberPackageId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO membership_packages (package_id, name, price, duration_days, is_active)
            VALUES (9901, 'Historical membership snapshot', 123000, 30, true);
            INSERT INTO member_packages (member_package_id, member_id, package_id, start_date, end_date, status, version)
            VALUES ({memberPackageId}, {member.UserId}, 9901, DATE '2026-10-01', DATE '2026-10-30', 1, 0);
            INSERT INTO invoice_items (item_id, invoice_id, item_type, description, unit_price, quantity, line_amount, related_entity_id)
            VALUES ({itemId}, {invoiceId}, 0, 'Historical membership snapshot', 123000, 1, 123000, {memberPackageId});
            """);
        // Seed the historical schema using its actual columns, not the current EF model.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO payments (payment_id, invoice_id, amount, method, status, received_by_user_id, paid_at)
            VALUES ({payment.PaymentId}, {invoiceId}, {payment.Amount}, 0, 1, {receptionist.UserId}, {now})
            """);
        await db.Database.MigrateAsync();
        var invoice = await db.Invoices.AsNoTracking().SingleAsync(x => x.InvoiceId == invoiceId);
        Assert.Equal(123_000m, invoice.TotalAmount);
        Assert.Equal(123_000m, invoice.CashAmount);
        Assert.Equal(0, invoice.PointsApplied);
        Assert.Null(invoice.CheckoutCycleId);
        Assert.Equal(memberPackageId, await db.InvoiceItems.Where(x => x.ItemId == itemId)
            .Select(x => x.MemberPackageId).SingleAsync());
        Assert.Equal(memberPackageId, await db.InvoiceItems.Where(x => x.ItemId == itemId)
            .Select(x => x.RelatedEntityId).SingleAsync());
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
        Assert.Equal(123_000m, await db.Payments.Where(x => x.PaymentId == payment.PaymentId).Select(x => x.Amount).SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Equal("9", await db.Set<SportHub.Administration.Domain.Entities.SystemSetting>()
            .Where(x => x.Key == "membership.expiry_notice_days").Select(x => x.Value).SingleAsync());
    }
}
