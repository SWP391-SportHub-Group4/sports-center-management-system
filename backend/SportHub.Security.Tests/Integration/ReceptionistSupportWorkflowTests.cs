using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ReceptionistSupportWorkflowTests(SportHubApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Only_manager_can_list_and_assign_active_administrators(UserRole actorRole)
    {
        var marker = Guid.NewGuid().ToString("N");
        var member = await factory.SeedUserAsync($"support-member-{marker}@example.com", null);
        var manager = await factory.SeedUserAsync($"support-manager-{marker}@example.com", null, role: UserRole.CenterManager);
        var admin = await factory.SeedUserAsync($"support-admin-{marker}@example.com", null, role: UserRole.SystemAdministrator);
        var inactive = await factory.SeedUserAsync($"support-inactive-admin-{marker}@example.com", null,
            UserStatus.Deactivated, UserRole.SystemAdministrator);
        var actor = await factory.SeedUserAsync($"support-actor-{marker}@example.com", null, role: actorRole);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var created = await client.PostAsJsonAsync("/api/member-support-requests", new {
            memberId = member.UserId, category = "GENERAL", subject = "Escalate request", description = "Administrator assistance needed" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();

        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(actor.UserId, actorRole));
        var list = await client.GetAsync("/api/member-support-requests/assignees");
        if (actorRole is UserRole.CenterManager or UserRole.Receptionist)
        {
            list.EnsureSuccessStatusCode();
            var rows = (await list.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
            Assert.Equal(actorRole == UserRole.CenterManager,
                rows.Any(x => x.GetProperty("userId").GetGuid() == admin.UserId));
            Assert.DoesNotContain(rows, x => x.GetProperty("userId").GetGuid() == inactive.UserId);
        }
        else Assert.Equal(HttpStatusCode.Forbidden, list.StatusCode);

        var assigned = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = admin.UserId, note = "Escalating for administrator review" });
        Assert.Equal(actorRole == UserRole.CenterManager ? HttpStatusCode.OK : HttpStatusCode.Forbidden, assigned.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var row = await db.MemberSupportRequests.AsNoTracking().SingleAsync(x => x.RequestId == id);
        Assert.Equal(actorRole == UserRole.CenterManager ? (Guid?)admin.UserId : null, row.AssignedToUserId);
        Assert.Equal(actorRole == UserRole.CenterManager ? "ASSIGNED" : "OPEN", row.Status);
        Assert.Equal(actorRole == UserRole.CenterManager ? 1 : 0,
            await db.AuditLogs.CountAsync(x => x.TargetId == id.ToString() && x.Action == "ASSIGN_SUPPORT_REQUEST"));
        Assert.Equal(actorRole == UserRole.CenterManager ? 1 : 0,
            await db.Notifications.CountAsync(x => x.UserId == admin.UserId && x.SourceEventType == NotificationSourceEventType.SupportRequestAssigned));
        if (actorRole == UserRole.CenterManager)
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
                $"/api/member-support-requests/{id}/assign", new { assigneeUserId = inactive.UserId })).StatusCode);
    }

    [Fact]
    public async Task Admin_receives_assignment_in_bell_and_inbox_without_duplicate_notifications_on_retry()
    {
        var marker = Guid.NewGuid().ToString("N");
        var member = await factory.SeedUserAsync($"support-member-{marker}@example.com", null, fullName: "Member needing help");
        var manager = await factory.SeedUserAsync($"support-manager-{marker}@example.com", null, role: UserRole.CenterManager, fullName: "Assigning Manager");
        var admin = await factory.SeedUserAsync($"support-admin-{marker}@example.com", null, role: UserRole.SystemAdministrator);
        var otherAdmin = await factory.SeedUserAsync($"support-other-admin-{marker}@example.com", null, role: UserRole.SystemAdministrator);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var created = await client.PostAsJsonAsync("/api/member-support-requests", new {
            memberId = member.UserId, category = "PAYMENT", subject = $"Payment assistance {marker}", description = "Please investigate this member payment." });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var assignment = new { assigneeUserId = admin.UserId, note = "Escalating for administrator review" };
        var results = await Task.WhenAll(
            client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", assignment),
            client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", assignment));
        Assert.All(results, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/progress", new { note = "Waiting for administrator review" })).EnsureSuccessStatusCode();
        var retry = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", assignment);
        Assert.Equal("IN_PROGRESS", (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        using var recipient = factory.CreateApiClient();
        recipient.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(admin.UserId, UserRole.SystemAdministrator));
        var unread = await recipient.GetFromJsonAsync<JsonElement>("/api/notifications/unread-count");
        Assert.Equal(1, unread.GetProperty("count").GetInt32());
        var notices = await recipient.GetFromJsonAsync<JsonElement>("/api/notifications");
        var notice = Assert.Single(notices.EnumerateArray());
        Assert.Equal("SUPPORT_REQUEST_ASSIGNED", notice.GetProperty("sourceEventType").GetString());
        var message = notice.GetProperty("message").GetString()!;
        Assert.Contains("Assigning Manager", message);
        Assert.Contains("Member needing help", message);
        Assert.Contains($"Payment assistance {marker}", message);
        Assert.Contains("Please investigate this member payment.", message);
        var notificationId = notice.GetProperty("notificationId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await recipient.GetAsync($"/api/notifications/{notificationId}")).StatusCode);
        (await recipient.PostAsync($"/api/notifications/{notificationId}/read", null)).EnsureSuccessStatusCode();
        Assert.Equal(0, (await recipient.GetFromJsonAsync<JsonElement>("/api/notifications/unread-count")).GetProperty("count").GetInt32());
        using var outsider = factory.CreateApiClient();
        outsider.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(otherAdmin.UserId, UserRole.SystemAdministrator));
        Assert.Empty((await outsider.GetFromJsonAsync<JsonElement>("/api/notifications")).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/notifications/{notificationId}")).StatusCode);
        // Reassignment away and back is a new occurrence, unlike retrying the same assignment.
        (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = manager.UserId })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", assignment)).EnsureSuccessStatusCode();
        Assert.Equal(1, (await recipient.GetFromJsonAsync<JsonElement>("/api/notifications/unread-count")).GetProperty("count").GetInt32());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(2, await db.Notifications.CountAsync(x => x.UserId == admin.UserId && x.SourceEventType == NotificationSourceEventType.SupportRequestAssigned));
        Assert.False(await db.Notifications.AnyAsync(x => x.UserId == manager.UserId && x.SourceEventType == NotificationSourceEventType.SupportRequestAssigned));
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    public async Task Desk_assigns_updates_and_completes_a_member_request(UserRole actorRole)
    {
        var member = await factory.SeedUserAsync($"support-member-{Guid.NewGuid():N}@example.com", null, role: UserRole.Member);
        var desk = await factory.SeedUserAsync($"support-desk-{Guid.NewGuid():N}@example.com", null, role: actorRole);
        var handler = await factory.SeedUserAsync($"support-handler-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var coach = await factory.SeedUserAsync($"support-coach-{Guid.NewGuid():N}@example.com", null, UserStatus.Deactivated, UserRole.Coach);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(desk.UserId, actorRole));
        var created = await client.PostAsJsonAsync("/api/member-support-requests",
            new { memberId = member.UserId, category = "OTHER", subject = "Membership help", description = "Needs assistance" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/assign", new { assigneeUserId = coach.UserId })).StatusCode);
        var assigned = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign",
            new { assigneeUserId = handler.UserId, note = "Escalating for manager review" });
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
    public async Task Member_cannot_read_or_mutate_staff_support_requests(UserRole role)
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

    [Fact]
    public async Task Admin_can_handle_only_assigned_requests_and_loses_access_after_reassignment()
    {
        var marker = Guid.NewGuid().ToString("N");
        var manager = await factory.SeedUserAsync($"support-owner-manager-{marker}@example.com", null, role: UserRole.CenterManager);
        var member = await factory.SeedUserAsync($"support-owner-member-{marker}@example.com", null);
        var admin = await factory.SeedUserAsync($"support-owner-admin-{marker}@example.com", null, role: UserRole.SystemAdministrator);
        var other = await factory.SeedUserAsync($"support-owner-other-{marker}@example.com", null, role: UserRole.SystemAdministrator);
        using var client = factory.CreateApiClient();
        void As(Guid userId, UserRole role) => client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(userId, role));
        As(manager.UserId, UserRole.CenterManager);
        var created = await client.PostAsJsonAsync("/api/member-support-requests", new {
            memberId = member.UserId, category = "ACCOUNT", description = "Help with account access",
            assigneeUserId = admin.UserId, handoverNote = "Administrator review required" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var path = $"/api/member-support-requests/{id}";
        As(other.UserId, UserRole.SystemAdministrator);
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue")).GetProperty("items").EnumerateArray());
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats")).GetProperty("notStarted").GetInt32());
        foreach (var suffix in new[] { "", "/events" })
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path + suffix)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path + "/progress", new { note = "Unauthorized progress" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path + "/done", new { reason = "Unauthorized completion" })).StatusCode);
        As(admin.UserId, UserRole.SystemAdministrator);
        var queue = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=NOT_STARTED");
        Assert.Equal(id, Assert.Single(queue.GetProperty("items").EnumerateArray()).GetProperty("requestId").GetGuid());
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats")).GetProperty("notStarted").GetInt32());
        (await client.GetAsync(path + "/events")).EnsureSuccessStatusCode();
        var notice = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/notifications")).EnumerateArray());
        Assert.Equal($"/admin/support?request={id}", notice.GetProperty("actionUrl").GetString());
        foreach (var route in new[] { "assignees", $"?memberId={member.UserId}" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/member-support-requests/{route}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/member-support-requests", new {
            memberId = member.UserId, category = "ACCOUNT", description = "Not allowed to create" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = other.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/reject", new { reason = "Not permitted" })).StatusCode);
        (await client.PostAsJsonAsync(path + "/progress", new { note = "Investigating the account" })).EnsureSuccessStatusCode();
        Assert.Equal("IN_PROGRESS", (await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("status").GetString());
        As(manager.UserId, UserRole.CenterManager);
        (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = other.UserId, note = "Transfer to another administrator" })).EnsureSuccessStatusCode();
        As(admin.UserId, UserRole.SystemAdministrator);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path + "/done", new { reason = "Former owner completion" })).StatusCode);
        As(other.UserId, UserRole.SystemAdministrator);
        (await client.PostAsJsonAsync(path + "/done", new { reason = "Account access restored" })).EnsureSuccessStatusCode();
        var completed = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=DONE");
        Assert.Equal(id, Assert.Single(completed.GetProperty("items").EnumerateArray()).GetProperty("requestId").GetGuid());
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats")).GetProperty("done").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path + "/progress", new { note = "Cannot reopen" })).StatusCode);
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
