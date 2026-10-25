using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using SportHub.API.Persistence;
using SportHub.Audit.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using Testcontainers.PostgreSql;

namespace SportHub.Security.Tests.Integration;

public sealed class AccountStatusMigrationTests
{
    [Fact]
    public async Task Upgrade_merges_legacy_inactive_accounts_without_reviving_them_or_rewriting_history()
    {
        Assert.Equal(0, (int)UserStatus.Active);
        Assert.Equal(2, (int)UserStatus.Deactivated);
        Assert.Equal(2, Enum.GetValues<UserStatus>().Length);

        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<SportHubDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).UseSnakeCaseNamingConvention().Options;
        await using var db = new SportHubDbContext(options);
        var migrator = db.GetService<IMigrator>();
        var migrations = db.Database.GetMigrations().ToArray();
        var index = Array.FindIndex(migrations, m => m.EndsWith("_CanonicalAccountStatus"));
        Assert.True(index > 0);
        var previousMigration = migrations[index - 1];
        await migrator.MigrateAsync(previousMigration);

        var active = Guid.NewGuid();
        var legacy = Guid.NewGuid();
        var inactive = Guid.NewGuid();
        var stamp = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO user_accounts (user_id, email, role_id, status, security_stamp, created_at)
            VALUES ({active}, 'active@status-migration.test', 4, 0, {stamp}, {now}),
                   ({legacy}, 'legacy@status-migration.test', 4, 1, {stamp}, {now}),
                   ({inactive}, 'inactive@status-migration.test', 4, 2, {stamp}, {now});
            """);
        var audit = new AuditLog
        {
            AuditId = Guid.NewGuid(), UserId = active, ActorRole = "SYSTEM_ADMINISTRATOR",
            Action = "LOCK_USER_ACCOUNT", TargetEntity = "UserAccount", TargetId = legacy.ToString(),
            OldValue = "{\"status\":\"Active\"}", NewValue = "{\"status\":\"Banned\"}",
            Timestamp = now, IpAddress = "127.0.0.1"
        };
        db.AuditLogs.Add(audit);
        await db.SaveChangesAsync();

        await migrator.MigrateAsync();
        var accounts = await db.UserAccounts.AsNoTracking().ToDictionaryAsync(u => u.UserId);
        Assert.Equal(3, accounts.Count);
        Assert.Equal(UserStatus.Active, accounts[active].Status);
        Assert.Equal(UserStatus.Deactivated, accounts[legacy].Status);
        Assert.Equal(UserStatus.Deactivated, accounts[inactive].Status);
        Assert.All(accounts.Values, account => Assert.Equal(stamp, account.SecurityStamp));
        var historicalAudit = await db.AuditLogs.AsNoTracking().SingleAsync();
        Assert.Equal(audit.Action, historicalAudit.Action);
        Assert.Contains("Banned", historicalAudit.NewValue);
        Assert.Equal(audit.TargetId, historicalAudit.TargetId);
        Assert.False(db.Database.HasPendingModelChanges());

        foreach (var invalid in new[] { 1, 3, -1 })
        {
            var error = await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE user_accounts SET status = {invalid} WHERE user_id = {active}"));
            Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        }

        await migrator.MigrateAsync(previousMigration);
        var afterRollback = await db.UserAccounts.AsNoTracking().ToDictionaryAsync(u => u.UserId);
        Assert.Equal(UserStatus.Active, afterRollback[active].Status);
        Assert.Equal(UserStatus.Deactivated, afterRollback[legacy].Status);
        Assert.Equal(UserStatus.Deactivated, afterRollback[inactive].Status);
        await migrator.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
    }
}
