using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class CoachMemberReadScopeTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Coach_can_read_only_members_with_an_active_relationship()
    {
        var coach = await factory.SeedUserAsync($"coach-scope-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var assigned = await factory.SeedUserAsync($"member-assigned-{Guid.NewGuid():N}@example.com", null);
        var other = await factory.SeedUserAsync($"member-other-{Guid.NewGuid():N}@example.com", null);
        var former = await factory.SeedUserAsync($"member-former-{Guid.NewGuid():N}@example.com", null);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coach.UserId, MemberId = assigned.UserId,
                SourceType = RelationshipSourceType.AssignedByManager,
                Status = RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coach.UserId, MemberId = former.UserId,
                SourceType = RelationshipSourceType.AssignedByManager,
                Status = RelationshipStatus.Ended, StartedAt = DateTime.UtcNow.AddDays(-2), EndedAt = DateTime.UtcNow.AddDays(-1)
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/member-packages")).StatusCode);

        foreach (var path in new[] { "api/users/{0}", "api/members/{0}/packages", "api/members/{0}/training-profile" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(string.Format(path, other.UserId))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(string.Format(path, former.UserId))).StatusCode);
            Assert.True((await client.GetAsync(string.Format(path, assigned.UserId))).IsSuccessStatusCode);
        }
    }
}
