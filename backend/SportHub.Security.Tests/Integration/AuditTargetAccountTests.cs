using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class AuditTargetAccountTests(SportHubApiFactory factory)
{
    private async Task<HttpClient> ClientAsync(UserRole role)
    {
        var user = await factory.SeedUserAsync($"audit-reader-{Guid.NewGuid():N}@example.com", null, role: role);
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(user.UserId, role));
        return client;
    }

    [Fact]
    public async Task Admin_reads_current_target_identity_without_changing_the_event_or_detail_policy()
    {
        var actor = await factory.SeedUserAsync($"audit-admin-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.SystemAdministrator, fullName: "Admin thực hiện");
        var target = await factory.SeedUserAsync($"audit-target-{Guid.NewGuid():N}@example.com", null,
            fullName: "Nguyễn Văn Đích");
        var action = $"AUDIT_IDENTITY_{Guid.NewGuid():N}";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.AuditLogs.Add(new AuditLog
            {
                AuditId = Guid.NewGuid(), UserId = actor.UserId, Action = action,
                TargetEntity = "UserAccount", TargetId = target.UserId.ToString().ToUpperInvariant(),
                Timestamp = DateTime.UtcNow, OldValue = "{\"role\":\"RECEPTIONIST\"}", NewValue = "{\"role\":\"MEMBER\"}"
            });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(actor.UserId, UserRole.SystemAdministrator));
        var result = await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}");
        var row = Assert.Single(result!.Items);
        Assert.Equal(actor.Email, row.ActorEmail);
        Assert.Equal(target.Email, row.TargetEmail);
        Assert.Equal("Nguyễn Văn Đích", row.TargetFullName);
        Assert.True(row.TargetAccountExists);
        using var oldValue = JsonDocument.Parse(row.OldValue!);
        Assert.Equal("RECEPTIONIST", oldValue.RootElement.GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"api/users/{target.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"api/users/admin/{target.UserId}")).StatusCode);

        var updatedEmail = $"updated-target-{Guid.NewGuid():N}@example.com";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var user = await db.UserAccounts.Include(u => u.Profile).SingleAsync(u => u.UserId == target.UserId);
            user.Email = updatedEmail;
            user.Profile!.FullName = "Tên hiện tại";
            await db.SaveChangesAsync();
        }
        var refreshed = Assert.Single((await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}"))!.Items);
        Assert.Equal(updatedEmail, refreshed.TargetEmail);
        Assert.Equal("Tên hiện tại", refreshed.TargetFullName);
        Assert.Equal(row.OldValue, refreshed.OldValue);
        Assert.Equal(row.NewValue, refreshed.NewValue);
        Assert.Equal(row.TargetId, refreshed.TargetId);
    }

    [Fact]
    public async Task Missing_and_invalid_account_targets_preserve_pagination_and_non_account_scope()
    {
        var actor = await factory.SeedUserAsync($"audit-actor-{Guid.NewGuid():N}@example.com", null, role: UserRole.SystemAdministrator);
        var target = await factory.SeedUserAsync($"audit-existing-{Guid.NewGuid():N}@example.com", null);
        var action = $"AUDIT_MIXED_{Guid.NewGuid():N}";
        var missingId = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var entries = new[] { ("UserAccount", target.UserId.ToString()), ("UserAccount", missingId), ("UserAccount", "invalid-id"), ("Room", target.UserId.ToString()) };
            for (var i = 0; i < entries.Length; i++)
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = actor.UserId, Action = action,
                    TargetEntity = entries[i].Item1, TargetId = entries[i].Item2, Timestamp = now.AddSeconds(i) });
            await db.SaveChangesAsync();
        }
        using var admin = await ClientAsync(UserRole.SystemAdministrator);
        var first = (await admin.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}&sortDirection=asc&pageSize=2"))!;
        Assert.Equal(3, first.TotalCount);
        Assert.Equal(2, first.Items.Count);
        Assert.True(first.Items[0].TargetAccountExists);
        Assert.Equal(missingId, first.Items[1].TargetId);
        Assert.False(first.Items[1].TargetAccountExists);
        Assert.Null(first.Items[1].TargetFullName);
        Assert.Null(first.Items[1].TargetEmail);
        var second = (await admin.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}&sortDirection=asc&pageSize=2&page=2"))!;
        var invalid = Assert.Single(second.Items);
        Assert.Equal("invalid-id", invalid.TargetId);
        Assert.False(invalid.TargetAccountExists);
        Assert.Equal(3, second.TotalCount);

        using var manager = await ClientAsync(UserRole.CenterManager);
        var mixed = (await manager.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={action}&sortDirection=asc"))!;
        Assert.Equal(4, mixed.TotalCount);
        var room = Assert.Single(mixed.Items, row => row.TargetEntity == "Room");
        Assert.Null(room.TargetAccountExists);
        Assert.Null(room.TargetFullName);
        Assert.Null(room.TargetEmail);
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    public async Task Target_identity_does_not_expand_audit_read_permissions(UserRole role)
    {
        using var client = await ClientAsync(role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/audit-logs")).StatusCode);
    }
}
