using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class CoachSupportWorkflowTests(SportHubApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Status_filters_and_totals_preserve_outcomes_and_assigned_only_visibility(UserRole role)
    {
        var marker = Guid.NewGuid().ToString("N");
        var member = await factory.SeedUserAsync($"support-status-member-{marker}@example.com", null);
        var owner = await factory.SeedUserAsync($"support-status-owner-{marker}@example.com", null, role: role);
        var other = await factory.SeedUserAsync($"support-status-other-{marker}@example.com", null, role: UserRole.Coach);
        var statuses = new[] { "OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "REJECTED", "CLOSED" };
        var now = DateTime.UtcNow;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            foreach (var assignedTo in new[] { owner.UserId, other.UserId })
            foreach (var status in statuses)
                db.Set<MemberSupportRequest>().Add(new MemberSupportRequest
                {
                    RequestId = Guid.NewGuid(), MemberId = member.UserId,
                    RecordedByUserId = member.UserId, AssignedToUserId = assignedTo,
                    Category = "CLASS", Subject = $"Status test {marker}", Description = "Review the lesson plan.",
                    Status = status, CreatedAt = now, SlaDueAtUtc = now.AddDays(1),
                    ProgressNote = status == "REJECTED" ? "The request was declined." : null,
                    ClosedAt = status is "DONE" or "REJECTED" or "CLOSED" ? now : null
                });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(owner.UserId, role));
        var stats = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats");
        Assert.Equal(1, stats.GetProperty("open").GetInt32());
        Assert.Equal(1, stats.GetProperty("assigned").GetInt32());
        Assert.Equal(1, stats.GetProperty("inProgress").GetInt32());
        Assert.Equal(1, stats.GetProperty("rejected").GetInt32());
        Assert.Equal(2, stats.GetProperty("notStarted").GetInt32());
        Assert.Equal(2, stats.GetProperty("done").GetInt32());
        foreach (var status in statuses)
        {
            var filtered = await client.GetFromJsonAsync<JsonElement>($"/api/member-support-requests/queue?status={status}");
            Assert.Equal(1, filtered.GetProperty("totalCount").GetInt32());
            var row = Assert.Single(filtered.GetProperty("items").EnumerateArray());
            Assert.Equal(status, row.GetProperty("status").GetString());
            Assert.Equal(owner.UserId, row.GetProperty("assignedToUserId").GetGuid());
            if (status == "REJECTED") Assert.Equal("The request was declined.", row.GetProperty("progressNote").GetString());
        }
        var finished = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=FINISHED");
        Assert.Equal(2, finished.GetProperty("totalCount").GetInt32());
        Assert.All(finished.GetProperty("items").EnumerateArray(), row =>
            Assert.Contains(row.GetProperty("status").GetString(), new[] { "DONE", "CLOSED" }));
        var hidden = await client.GetFromJsonAsync<JsonElement>($"/api/member-support-requests/queue?assignedToUserId={other.UserId}");
        Assert.Equal(0, hidden.GetProperty("totalCount").GetInt32());
        var assigned = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=ASSIGNED");
        var requestId = Assert.Single(assigned.GetProperty("items").EnumerateArray()).GetProperty("requestId").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/member-support-requests/{requestId}/reject", new { reason = "Not authorized" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/member-support-requests/{requestId}/assign", new { assigneeUserId = other.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/member-support-requests", new { memberId = member.UserId, category = "CLASS", description = "Cannot create requests" })).StatusCode);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Manager_hands_over_to_coach_with_private_notice_email_and_owned_workflow(bool assignOnCreate)
    {
        var marker = Guid.NewGuid().ToString("N");
        var manager = await factory.SeedUserAsync($"manager-{marker}@example.com", null, role: UserRole.CenterManager);
        var member = await factory.SeedUserAsync($"member-{marker}@example.com", null);
        var coach = await factory.SeedUserAsync($"coach-{marker}@example.com", null, role: UserRole.Coach);
        var other = await factory.SeedUserAsync($"other-coach-{marker}@example.com", null, role: UserRole.Coach);
        var desk = await factory.SeedUserAsync($"desk-{marker}@example.com", null, role: UserRole.Receptionist);
        using var client = factory.CreateApiClient();
        void As(Guid id, UserRole role) => client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(id, role));
        As(manager.UserId, UserRole.CenterManager);
        var choices = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/assignees");
        Assert.Contains(choices.EnumerateArray(), x => x.GetProperty("userId").GetGuid() == coach.UserId);
        var created = await client.PostAsJsonAsync("/api/member-support-requests", new {
            memberId = member.UserId, category = "CLASS", description = "Please review my training <script>example</script>.",
            assigneeUserId = assignOnCreate ? (Guid?)coach.UserId : null });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
        var path = $"/api/member-support-requests/{id}";
        if (!assignOnCreate) (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = coach.UserId })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = coach.UserId })).EnsureSuccessStatusCode();
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var notices = await db.Notifications.Where(n => n.UserId == coach.UserId && n.SourceEventType == NotificationSourceEventType.SupportRequestAssigned).ToListAsync();
            Assert.Equal(2, notices.Count);
            Assert.Single(notices, n => n.Channel == NotificationChannel.InApp);
            var email = Assert.Single(notices, n => n.Channel == NotificationChannel.Email);
            Assert.Equal(coach.Email, email.RecipientAddress);
            Assert.NotNull(email.ProtectedEmailPayload);
        }
        As(desk.UserId, UserRole.Receptionist);
        Assert.DoesNotContain((await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/assignees")).EnumerateArray(), x => x.GetProperty("userId").GetGuid() == coach.UserId);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = other.UserId })).StatusCode);
        As(other.UserId, UserRole.Coach);
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path + "/events")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path + "/progress", new { note = "Unauthorized progress" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path + "/done", new { reason = "Unauthorized completion" })).StatusCode);
        As(coach.UserId, UserRole.Coach);
        var list = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue");
        Assert.Equal(id, Assert.Single(list.GetProperty("items").EnumerateArray()).GetProperty("requestId").GetGuid());
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats")).GetProperty("assigned").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(path + "/events")).StatusCode);
        var notice = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/notifications")).EnumerateArray());
        Assert.Equal($"/coach/support?request={id}", notice.GetProperty("actionUrl").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/assign", new { assigneeUserId = manager.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/member-support-requests/assignees")).StatusCode);
        (await client.PostAsJsonAsync(path + "/progress", new { note = "Reviewed the training schedule" })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync(path + "/done", new { reason = "Explained the training plan to the member" })).EnsureSuccessStatusCode();
        Assert.Equal("DONE", (await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path + "/progress", new { note = "Reopen request" })).StatusCode);
    }
}
