using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class AvatarReportWorkflowTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Report_is_deduplicated_notifies_manager_and_direct_removal_resolves_it()
    {
        var member = await factory.SeedUserAsync($"reporter-{Guid.NewGuid():N}@example.com", null);
        var coach = await factory.SeedUserAsync($"reported-{Guid.NewGuid():N}@example.com", null, role:UserRole.Coach);
        var manager = await factory.SeedUserAsync($"moderator-{Guid.NewGuid():N}@example.com", null, role:UserRole.CenterManager);
        const string photo = "https://example.invalid/reported.png";
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.UserProfiles.Where(p => p.UserId == coach.UserId).ExecuteUpdateAsync(p => p.SetProperty(x => x.AvatarUrl, photo));
        }
        HttpClient Client(Guid id, UserRole role) {
            var client = factory.CreateApiClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(id, role));
            return client;
        }
        using var reporter = Client(member.UserId, UserRole.Member);
        using var reviewer = Client(manager.UserId, UserRole.CenterManager);
        Guid? reportId = null;
        for (var attempt = 0; attempt < 2; attempt++) {
            var response = await reporter.PostAsJsonAsync("/api/avatars/reports", new {targetUserId=coach.UserId, avatarUrl=photo, reason="Inappropriate profile photo"});
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            var id = body.GetProperty("reportId").GetGuid();
            if (reportId is not null) Assert.Equal(reportId.Value, id);
            reportId = id;
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await reporter.GetAsync("/api/manager/avatar-reports")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reporter.GetAsync("/api/manager/requests/summary")).StatusCode);
        var summary = await reviewer.GetFromJsonAsync<JsonElement>("/api/manager/requests/summary");
        Assert.True(summary.GetProperty("avatar").GetInt32() >= 1);
        Assert.Contains("/manager/requests?type=avatar", await reviewer.GetStringAsync("/api/notifications"));
        Assert.Equal(HttpStatusCode.Forbidden, (await reporter.DeleteAsync($"/api/manager/users/{coach.UserId}/avatar")).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.Equal(1, await db.Set<AvatarReport>().CountAsync(r => r.TargetUserId == coach.UserId));
            Assert.True(await db.Notifications.AnyAsync(n => n.UserId == manager.UserId && n.SourceEntityId == reportId));
        }
        Assert.Equal(HttpStatusCode.OK, (await reviewer.DeleteAsync($"/api/manager/users/{coach.UserId}/avatar")).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.Null(await db.UserProfiles.Where(p => p.UserId == coach.UserId).Select(p => p.AvatarUrl).SingleAsync());
            Assert.Equal("REMOVED", await db.Set<AvatarReport>().Where(r => r.ReportId == reportId).Select(r => r.Status).SingleAsync());
        }
        Assert.Equal(HttpStatusCode.OK, (await reviewer.DeleteAsync($"/api/manager/users/{coach.UserId}/avatar")).StatusCode);
    }
}
