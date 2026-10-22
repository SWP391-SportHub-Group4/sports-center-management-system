using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using Testcontainers.PostgreSql;

namespace SportHub.Security.Tests.Integration;

public sealed class AuditRoleMigrationTests
{
    [Fact]
    public async Task Upgrade_recovers_roles_from_change_history_and_preserves_event_data()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<SportHubDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).UseSnakeCaseNamingConvention().Options;
        await using var db = new SportHubDbContext(options);
        var migrator = db.GetService<IMigrator>();
        var migrations = db.Database.GetMigrations().ToArray();
        var newest = Array.FindIndex(migrations, m => m.EndsWith("_AuditActorRoleSnapshot"));
        Assert.True(newest > 0);
        await migrator.MigrateAsync(migrations[newest - 1]);
        var actor = new UserAccount { UserId = Guid.NewGuid(), Email = "migrated-manager@example.com",
            RoleId = 1, Status = UserStatus.Active, CreatedAt = DateTime.UtcNow };
        var admin = new UserAccount { UserId = Guid.NewGuid(), Email = "migrated-admin@example.com",
            RoleId = 5, Status = UserStatus.Active, CreatedAt = DateTime.UtcNow };
        // This database intentionally stops before the audit migration. Insert using that
        // historical schema: the current UserAccount model can contain columns added later.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO user_accounts (user_id, email, role_id, status, security_stamp, created_at)
            VALUES ({actor.UserId}, {actor.Email}, {actor.RoleId}, {(int)actor.Status}, {actor.SecurityStamp}, {actor.CreatedAt}),
                   ({admin.UserId}, {admin.Email}, {admin.RoleId}, {(int)admin.Status}, {admin.SecurityStamp}, {admin.CreatedAt});
            """);
        var beforeId = Guid.NewGuid(); var changeId = Guid.NewGuid(); var afterId = Guid.NewGuid(); var systemId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var before = now.AddHours(-2); var change = now.AddHours(-1);
        var oldValue = "{\"role\":\"Receptionist\"}";
        var newValue = "{\"value\":{\"role\":\"CenterManager\"},\"reason\":\"Promotion\"}";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO audit_logs (audit_id, user_id, action, target_entity, target_id, ip_address, timestamp, old_value, new_value)
            VALUES ({beforeId}, {actor.UserId}, 'LEGACY_BEFORE', 'Class', '1', '127.0.0.1', {before}, NULL, NULL),
                   ({changeId}, {admin.UserId}, 'CHANGE_USER_ROLE', 'UserAccount', {actor.UserId.ToString()}, '127.0.0.1', {change}, {oldValue}::jsonb, {newValue}::jsonb),
                   ({afterId}, {actor.UserId}, 'LEGACY_AFTER', 'Class', '1', '127.0.0.1', {now}, NULL, NULL),
                   ({systemId}, {actor.UserId}, 'LEGACY_JOB', 'Class', '1', '', {now}, NULL, NULL);
            """);
        await migrator.MigrateAsync();
        var logs = await db.AuditLogs.AsNoTracking().ToDictionaryAsync(a => a.AuditId);
        Assert.Equal("RECEPTIONIST", logs[beforeId].ActorRole);
        Assert.Equal("CENTER_MANAGER", logs[afterId].ActorRole);
        Assert.Equal("SYSTEM_ADMINISTRATOR", logs[changeId].ActorRole);
        Assert.Equal("SYSTEM", logs[systemId].ActorRole);
        Assert.Equal("LEGACY_BEFORE", logs[beforeId].Action);
        Assert.Equal("1", logs[beforeId].TargetId);
        Assert.Contains("Receptionist", logs[changeId].OldValue);
        Assert.Contains("Promotion", logs[changeId].NewValue);
        Assert.Equal(4, logs.Count);
        Assert.False(db.Database.HasPendingModelChanges());
    }
}
