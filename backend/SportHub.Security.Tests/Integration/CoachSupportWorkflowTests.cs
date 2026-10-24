using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class CoachSupportWorkflowTests(SportHubApiFactory factory)
{
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
            Assert.Single(notices.Where(n => n.Channel == NotificationChannel.InApp));
            var email = Assert.Single(notices.Where(n => n.Channel == NotificationChannel.Email));
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
