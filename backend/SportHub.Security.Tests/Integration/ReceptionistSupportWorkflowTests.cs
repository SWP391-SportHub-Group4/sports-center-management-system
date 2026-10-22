using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ReceptionistSupportWorkflowTests(SportHubApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    public async Task Desk_assigns_updates_and_completes_a_member_request(UserRole actorRole)
    {
        var member = await factory.SeedUserAsync($"support-member-{Guid.NewGuid():N}@example.com", null, role: UserRole.Member);
        var desk = await factory.SeedUserAsync($"support-desk-{Guid.NewGuid():N}@example.com", null, role: actorRole);
        var handler = await factory.SeedUserAsync($"support-handler-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var coach = await factory.SeedUserAsync($"support-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(desk.UserId, actorRole));
        var created = await client.PostAsJsonAsync("/api/member-support-requests",
            new { memberId = member.UserId, category = "OTHER", subject = "Membership help", description = "Needs assistance" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/assign", new { assigneeUserId = coach.UserId })).StatusCode);
        var assigned = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign",
            new { assigneeUserId = handler.UserId });
        Assert.True(assigned.StatusCode == HttpStatusCode.OK, await assigned.Content.ReadAsStringAsync());
        Assert.Equal("ASSIGNED", (await assigned.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        var progress = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/progress",
            new { note = "Checking the account" });
        Assert.True(progress.StatusCode == HttpStatusCode.OK, await progress.Content.ReadAsStringAsync());
        Assert.Equal("IN_PROGRESS", (await progress.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        var completed = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/done",
            new { reason = "Account corrected" });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        Assert.Equal("DONE", (await completed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/progress", new { note = "Try to reopen" })).StatusCode);
        var queue = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=DONE");
        Assert.Contains(queue.GetProperty("items").EnumerateArray(), x => x.GetProperty("requestId").GetGuid() == id);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/assign", new { assigneeUserId = desk.UserId })).StatusCode);
        var retry = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/done", new { reason = "Different resolution" });
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        var rejectAfterDone = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/reject", new { reason = "Not permitted" });
        Assert.Equal(HttpStatusCode.Conflict, rejectAfterDone.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var logs = await db.AuditLogs.Where(x => x.TargetId == id.ToString()).ToListAsync();
        Assert.Equal(4, logs.Count);
        Assert.All(logs, log => Assert.Equal(desk.UserId, log.UserId));
        Assert.Contains(logs, log => log.Action == "COMPLETE_SUPPORT_REQUEST" && log.NewValue != null && log.NewValue.Contains("DONE"));
        var stored = await db.MemberSupportRequests.SingleAsync(x => x.RequestId == id);
        Assert.Equal("DONE", stored.Status);
        Assert.Equal("Account corrected", stored.ProgressNote);
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Non_front_desk_cannot_read_or_mutate_requests(UserRole role)
    {
        var user = await factory.SeedUserAsync($"support-denied-{Guid.NewGuid():N}@example.com", null, role: role);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(user.UserId, role));
        foreach (var route in new[] { "queue", "assignees", $"?memberId={Guid.NewGuid()}" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/member-support-requests/{route}")).StatusCode);
        foreach (var action in new[] { "assign", "progress", "done", "reject" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/member-support-requests/{Guid.NewGuid()}/{action}",
                new { assigneeUserId = user.UserId, note = "Test update", reason = "Test final note" })).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    public async Task Desk_rejects_request_and_blocks_further_changes(UserRole actorRole)
    {
        var member = await factory.SeedUserAsync($"support-reject-member-{Guid.NewGuid():N}@example.com", null, role: UserRole.Member);
        var desk = await factory.SeedUserAsync($"support-reject-desk-{Guid.NewGuid():N}@example.com", null, role: actorRole);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(desk.UserId, actorRole));

        var created = await client.PostAsJsonAsync("/api/member-support-requests",
            new { memberId = member.UserId, category = "OTHER", subject = "Rejected request", description = "Cannot be fulfilled" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign",
            new { assigneeUserId = desk.UserId })).EnsureSuccessStatusCode();

        var rejected = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/reject",
            new { reason = "Request cannot be approved" });
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        Assert.Equal("REJECTED", (await rejected.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        var queue = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=REJECTED");
        Assert.Contains(queue.GetProperty("items").EnumerateArray(), x => x.GetProperty("requestId").GetGuid() == id);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/progress", new { note = "Try again" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/assign", new { assigneeUserId = desk.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/done", new { reason = "Now approved" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/reject", new { reason = "Another reason" })).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var row = await db.MemberSupportRequests.SingleAsync(x => x.RequestId == id);
        Assert.Equal("REJECTED", row.Status);
        Assert.Equal("Request cannot be approved", row.ProgressNote);
        Assert.NotNull(row.ClosedAt);
        Assert.Equal(1, await db.AuditLogs.CountAsync(x => x.TargetId == id.ToString() && x.Action == "REJECT_SUPPORT_REQUEST"));
    }

    [Fact]
    public async Task Manager_filters_pages_and_sees_inactive_assignee_name()
    {
        var marker = Guid.NewGuid().ToString("N");
        var member = await factory.SeedUserAsync($"support-find-{marker}@example.com", null, fullName: $"Support member {marker}");
        var manager = await factory.SeedUserAsync($"support-manager-{marker}@example.com", null, role: UserRole.CenterManager);
        var handler = await factory.SeedUserAsync($"support-handler-{marker}@example.com", null, role: UserRole.Receptionist, fullName: "Support handler");
        var inactive = await factory.SeedUserAsync($"support-banned-{marker}@example.com", null, UserStatus.Banned, UserRole.Receptionist);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var ids = new List<Guid>();
        for (var i = 0; i < 2; i++)
        {
            var created = await client.PostAsJsonAsync("/api/member-support-requests", new { memberId = member.UserId,
                category = "OTHER", subject = $"Request {i}", description = "Member needs help" });
            created.EnsureSuccessStatusCode();
            var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
            ids.Add(id);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/progress", new { note = "Before assignment" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/done", new { reason = "Before assignment" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/reject", new { reason = "Before assignment" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = inactive.UserId })).StatusCode);
            (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = handler.UserId })).EnsureSuccessStatusCode();
        }
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            (await db.UserAccounts.SingleAsync(x => x.UserId == handler.UserId)).Status = UserStatus.Deactivated;
            await db.SaveChangesAsync();
        }
        var first = (await client.GetFromJsonAsync<JsonElement>($"/api/member-support-requests/queue?search={marker.ToUpperInvariant()}&status=ASSIGNED&assignedToUserId={handler.UserId}&pageSize=1"));
        Assert.Equal(2, first.GetProperty("totalCount").GetInt32());
        var row = Assert.Single(first.GetProperty("items").EnumerateArray());
        Assert.Equal($"Support member {marker}", row.GetProperty("memberName").GetString());
        Assert.Equal(member.Email, row.GetProperty("memberEmail").GetString());
        Assert.Equal("Support handler", row.GetProperty("assignedToName").GetString());
        var second = await client.GetFromJsonAsync<JsonElement>($"/api/member-support-requests/queue?search={marker}&page=2&pageSize=1");
        Assert.NotEqual(row.GetProperty("requestId").GetGuid(), Assert.Single(second.GetProperty("items").EnumerateArray()).GetProperty("requestId").GetGuid());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/member-support-requests/queue?status=WRONG")).StatusCode);
        var assignees = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/assignees");
        Assert.DoesNotContain(assignees.EnumerateArray(), x => x.GetProperty("userId").GetGuid() == handler.UserId || x.GetProperty("userId").GetGuid() == inactive.UserId);
        // A manager can transfer and handle a request whose former handler is inactive.
        (await client.PostAsJsonAsync($"/api/member-support-requests/{ids[0]}/assign", new { assigneeUserId = manager.UserId })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Concurrent_done_and_progress_keep_final_note_and_single_completion_audit()
    {
        var member = await factory.SeedUserAsync($"support-race-member-{Guid.NewGuid():N}@example.com", null);
        var manager = await factory.SeedUserAsync($"support-race-manager-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var created = await client.PostAsJsonAsync("/api/member-support-requests", new { memberId = member.UserId,
            category = "OTHER", subject = "Concurrent request", description = "Concurrent handling" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = manager.UserId })).EnsureSuccessStatusCode();
        var results = await Task.WhenAll(
            client.PostAsJsonAsync($"/api/member-support-requests/{id}/done", new { reason = "Final resolution" }),
            client.PostAsJsonAsync($"/api/member-support-requests/{id}/progress", new { note = "Concurrent progress" }),
            client.PostAsJsonAsync($"/api/member-support-requests/{id}/done", new { reason = "Final resolution" }));
        Assert.Contains(results[0].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        Assert.Contains(results[1].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        Assert.Contains(results[2].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        Assert.Equal(1, new[] { results[0], results[2] }.Count(x => x.StatusCode == HttpStatusCode.OK));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var row = await db.MemberSupportRequests.SingleAsync(x => x.RequestId == id);
        Assert.Equal("DONE", row.Status);
        Assert.Equal("Final resolution", row.ProgressNote);
        Assert.NotNull(row.ClosedAt);
        Assert.Equal(1, await db.AuditLogs.CountAsync(x => x.TargetId == id.ToString() && x.Action == "COMPLETE_SUPPORT_REQUEST"));
    }
}
