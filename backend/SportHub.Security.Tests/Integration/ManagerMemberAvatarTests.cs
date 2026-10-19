using System.Net;
using System.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ManagerMemberAvatarTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Only_manager_can_remove_current_member_photo()
    {
        var member = await factory.SeedUserAsync($"photo-member-{Guid.NewGuid():N}@example.com", null);
        var coach = await factory.SeedUserAsync($"photo-coach-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.Coach);
        var manager = await factory.SeedUserAsync($"photo-manager-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.CenterManager);
        var receptionist = await factory.SeedUserAsync($"photo-desk-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.Receptionist);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.UserProfiles.Where(x => x.UserId == member.UserId).ExecuteUpdateAsync(x => x
                .SetProperty(p => p.AvatarUrl, "https://example.invalid/member.png")
                .SetProperty(p => p.AvatarPublicId, "sporthub/avatars/member-test"));
            await db.UserProfiles.Where(x => x.UserId == coach.UserId).ExecuteUpdateAsync(x => x
                .SetProperty(p => p.AvatarUrl, "https://example.invalid/coach.png")
                .SetProperty(p => p.AvatarPublicId, "sporthub/avatars/coach-test"));
        }

        HttpClient Client(Guid userId, UserRole role)
        {
            var client = factory.CreateApiClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId, role));
            return client;
        }

        using var deskClient = Client(receptionist.UserId, UserRole.Receptionist);
        Assert.Contains((await deskClient.PostAsync("/api/avatars/reports", null)).StatusCode,
            new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Equal(HttpStatusCode.Forbidden,
            (await deskClient.DeleteAsync($"/api/manager/members/{member.UserId}/avatar")).StatusCode);
        using var managerClient = Client(manager.UserId, UserRole.CenterManager);
        Assert.Contains((await managerClient.GetAsync("/api/manager/avatar-reports")).StatusCode,
            new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Equal(HttpStatusCode.Forbidden,
            (await managerClient.DeleteAsync($"/api/manager/members/{coach.UserId}/avatar")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await managerClient.DeleteAsync($"/api/manager/members/{member.UserId}/avatar")).StatusCode);
        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Null(await verifyDb.UserProfiles.Where(x => x.UserId == member.UserId)
            .Select(x => x.AvatarUrl).SingleAsync());
        Assert.NotNull(await verifyDb.UserProfiles.Where(x => x.UserId == coach.UserId)
            .Select(x => x.AvatarUrl).SingleAsync());
    }
}
