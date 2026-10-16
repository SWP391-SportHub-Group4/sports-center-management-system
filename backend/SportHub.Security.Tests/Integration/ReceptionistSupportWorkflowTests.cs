using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ReceptionistSupportWorkflowTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Desk_assigns_updates_and_closes_a_member_request()
    {
        var member = await factory.SeedUserAsync($"support-member-{Guid.NewGuid():N}@example.com", null, role: UserRole.Member);
        var desk = await factory.SeedUserAsync($"support-desk-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        var handler = await factory.SeedUserAsync($"support-handler-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var coach = await factory.SeedUserAsync($"support-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(desk.UserId, UserRole.Receptionist));
        var created = await client.PostAsJsonAsync("/api/member-support-requests",
            new { memberId = member.UserId, category = "GENERAL", subject = "Membership help", description = "Needs assistance" });
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
        var closed = await client.PostAsJsonAsync($"/api/member-support-requests/{id}/close",
            new { resolution = "Account corrected" });
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);
        Assert.Equal("CLOSED", (await closed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/member-support-requests/{id}/progress", new { note = "Try to reopen" })).StatusCode);
        var queue = await client.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?status=CLOSED");
        Assert.Contains(queue.GetProperty("items").EnumerateArray(), x => x.GetProperty("requestId").GetGuid() == id);
    }
}
