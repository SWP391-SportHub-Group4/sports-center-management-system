using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class ManagerAuditScopeTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Target_filter_scopes_history_before_pagination_and_preserves_Admin_account_scope()
    {
        var actor = await factory.SeedUserAsync($"manager-history-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var action = $"HISTORY_{Guid.NewGuid():N}";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            foreach (var pair in new[] { ("Class", "123"), ("Class", "123"), ("Class", "124"), ("UserAccount", "123") })
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = actor.UserId, Action = action, TargetEntity = pair.Item1, TargetId = pair.Item2, Timestamp = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        using var manager = factory.CreateApiClient();
        manager.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(actor.UserId, UserRole.CenterManager));
        var query = $"api/audit-logs?action={action}&targetEntity=Class&targetId=123&pageSize=1";
        var first = (await manager.GetFromJsonAsync<PagedResult<AuditLogResponse>>(query))!;
        Assert.Equal(2, first.TotalCount);
        Assert.Equal("123", Assert.Single(first.Items).TargetId);
        var second = (await manager.GetFromJsonAsync<PagedResult<AuditLogResponse>>(query + "&page=2"))!;
        Assert.NotEqual(first.Items[0].AuditId, Assert.Single(second.Items).AuditId);

        var adminUser = await factory.SeedUserAsync($"admin-history-{Guid.NewGuid():N}@example.com", null, role: UserRole.SystemAdministrator);
        using var admin = factory.CreateApiClient();
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(adminUser.UserId, UserRole.SystemAdministrator));
        var adminResult = (await admin.GetFromJsonAsync<PagedResult<AuditLogResponse>>(query))!;
        Assert.Empty(adminResult.Items);
        Assert.Equal(0, adminResult.TotalCount);
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    public async Task Target_filter_does_not_grant_other_roles_audit_access(UserRole role)
    {
        var user = await factory.SeedUserAsync($"history-denied-{Guid.NewGuid():N}@example.com", null, role: role);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(user.UserId, role));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/audit-logs?targetEntity=Class&targetId=123")).StatusCode);
    }
}
