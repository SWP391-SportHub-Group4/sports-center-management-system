using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class ManagerAuditScopeTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Admin_action_choices_include_unrecorded_account_actions()
    {
        var isolated = new SportHubApiFactory();
        await ((IAsyncLifetime)isolated).InitializeAsync();
        try
        {
            var user = await isolated.SeedUserAsync($"audit-catalogue-{Guid.NewGuid():N}@example.com", null,
                role: UserRole.SystemAdministrator);
            string[] unrecorded;
            using (var scope = isolated.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
                var recorded = await db.AuditLogs.Select(a => a.Action).Distinct().ToListAsync();
                unrecorded = AccountAuditActions.All.Except(recorded).ToArray();
            }
            Assert.NotEmpty(unrecorded);
            using var client = isolated.CreateApiClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
                isolated.IssueToken(user.UserId, UserRole.SystemAdministrator));
            var actions = (await client.GetFromJsonAsync<List<string>>("api/audit-logs/actions"))!;
            foreach (var action in AccountAuditActions.All) Assert.Contains(action, actions);
            Assert.Equal(actions.Distinct(StringComparer.Ordinal).OrderBy(a => a, StringComparer.Ordinal), actions);
            foreach (var action in unrecorded)
            {
                var result = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>(
                    $"api/audit-logs?action={action}"))!;
                Assert.Empty(result.Items);
                Assert.Equal(0, result.TotalCount);
            }
        }
        finally
        {
            await ((IAsyncLifetime)isolated).DisposeAsync();
        }
    }

    [Fact]
    public async Task Action_choices_are_distinct_and_enforce_the_callers_audit_scope()
    {
        var managerUser = await factory.SeedUserAsync($"audit-actions-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.CenterManager);
        var accountAction = $"ACCOUNT_ACTION_{Guid.NewGuid():N}";
        var classAction = $"CLASS_ACTION_{Guid.NewGuid():N}";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            foreach (var (action, entity) in new[]
                { (accountAction, "UserAccount"), (accountAction, "UserAccount"), (classAction, "Class"), ("", "UserAccount"), ("   ", "Class") })
                db.AuditLogs.Add(new AuditLog
                {
                    AuditId = Guid.NewGuid(), UserId = managerUser.UserId, Action = action,
                    TargetEntity = entity, TargetId = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow
                });
            await db.SaveChangesAsync();
        }
        using var manager = factory.CreateApiClient();
        manager.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(managerUser.UserId, UserRole.CenterManager));
        var managerActions = (await manager.GetFromJsonAsync<List<string>>("api/audit-logs/actions"))!;
        Assert.Contains(accountAction, managerActions);
        Assert.Contains(classAction, managerActions);
        Assert.Equal(1, managerActions.Count(a => a == accountAction));
        Assert.DoesNotContain(managerActions, string.IsNullOrWhiteSpace);

        var adminUser = await factory.SeedUserAsync($"audit-actions-admin-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.SystemAdministrator);
        using var admin = factory.CreateApiClient();
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(adminUser.UserId, UserRole.SystemAdministrator));
        var adminActions = (await admin.GetFromJsonAsync<List<string>>(
            "api/audit-logs/actions?accountsOnly=false&targetEntity=Class"))!;
        Assert.Contains(accountAction, adminActions);
        Assert.Contains(classAction, adminActions);
        Assert.Equal(1, adminActions.Count(a => a == accountAction));
        Assert.DoesNotContain(adminActions, string.IsNullOrWhiteSpace);
    }

    [Fact]
    public async Task Target_filter_scopes_history_before_pagination_and_Admin_reads_Manager_operations()
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
        Assert.Single(adminResult.Items);
        Assert.Equal(2, adminResult.TotalCount);
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
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/audit-logs/actions")).StatusCode);
    }
}
