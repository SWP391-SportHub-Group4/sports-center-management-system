using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class AuditActorVisibilityTests(SportHubApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.SystemAdministrator, "CENTER_MANAGER,COACH,SYSTEM_ADMINISTRATOR,SYSTEM", "RECEPTIONIST")]
    [InlineData(UserRole.CenterManager, "CENTER_MANAGER,COACH,RECEPTIONIST,MEMBER", "SYSTEM")]
    public async Task Visibility_and_action_catalogue_use_event_role_before_filters_and_pagination(
        UserRole viewerRole, string allowedRoles, string deniedRole)
    {
        var marker = $"ROLE_SCOPE_{Guid.NewGuid():N}";
        var expected = allowedRoles.Split(',');
        var actors = new Dictionary<UserRole, Guid>();
        foreach (var role in Enum.GetValues<UserRole>())
        {
            var actor = await factory.SeedUserAsync($"audit-{role}-{Guid.NewGuid():N}@example.com", null, role: role);
            actors[role] = actor.UserId;
        }
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            foreach (var (role, id) in actors)
            {
                var recordedRole = System.Text.Json.JsonNamingPolicy.SnakeCaseUpper.ConvertName(role.ToString());
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = id,
                    ActorRole = recordedRole, Action = marker, TargetEntity = "Class", TargetId = "1", Timestamp = DateTime.UtcNow });
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = id,
                    ActorRole = recordedRole, Action = marker + "_" + recordedRole, TargetEntity = "Class", TargetId = "1", Timestamp = DateTime.UtcNow });
            }
            foreach (var action in new[] { marker, marker + "_SYSTEM" })
                db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = actors[UserRole.CenterManager],
                    ActorRole = "SYSTEM", Action = action, TargetEntity = "Class", TargetId = "1", Timestamp = DateTime.UtcNow });
            await db.SaveChangesAsync();
            // Changing current roles must never reclassify an existing event.
            await db.UserAccounts.Where(u => actors.Values.Contains(u.UserId)).ExecuteUpdateAsync(s => s.SetProperty(u => u.RoleId, 3));
        }
        var reader = await factory.SeedUserAsync($"reader-{Guid.NewGuid():N}@example.com", null, role: viewerRole);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(reader.UserId, viewerRole));
        var first = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={marker}&pageSize=2"))!;
        var second = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>($"api/audit-logs?action={marker}&pageSize=2&page=2"))!;
        Assert.Equal(4, first.TotalCount);
        Assert.Equal(4, second.TotalCount);
        Assert.Equal(expected.Order(), first.Items.Concat(second.Items).Select(a => a.ActorRole).Order());
        var denied = (await client.GetFromJsonAsync<PagedResult<AuditLogResponse>>(
            $"api/audit-logs?action={marker}&actorRole={deniedRole}&accountsOnly=false"))!;
        Assert.Empty(denied.Items);
        Assert.Equal(0, denied.TotalCount);
        var catalogue = (await client.GetFromJsonAsync<string[]>("api/audit-logs/actions"))!;
        foreach (var role in new[] { "CENTER_MANAGER", "COACH", "SYSTEM_ADMINISTRATOR", "RECEPTIONIST", "MEMBER", "SYSTEM" })
            Assert.Equal(expected.Contains(role), catalogue.Contains(marker + "_" + role));
    }

    [Fact]
    public async Task Request_writer_captures_role_and_background_writer_marks_system_execution()
    {
        var actor = await factory.SeedUserAsync($"audit-writer-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(actor.UserId, UserRole.Receptionist));
        var email = $"invited-member-{Guid.NewGuid():N}@example.com";
        var created = await client.PostAsJsonAsync("api/members/front-desk", new { email, confirmEmail = email, fullName = "Test Member" });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal("RECEPTIONIST", (await db.AuditLogs.SingleAsync(a => a.UserId == actor.UserId
            && a.Action == "FRONT_DESK_CREATE_MEMBER")).ActorRole);
        var writer = scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Audit.IAuditWriter>();
        var marker = $"BACKGROUND_{Guid.NewGuid():N}";
        writer.Write(new(actor.UserId, marker, "Class", "1"));
        await db.SaveChangesAsync();
        Assert.Equal("SYSTEM", (await db.AuditLogs.SingleAsync(a => a.Action == marker)).ActorRole);
    }
}
