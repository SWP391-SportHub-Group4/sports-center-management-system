using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class CoachMemberScopeTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Coach_reads_only_assigned_training_profile_and_cannot_browse_accounts_or_packages()
    {
        var coach = await factory.SeedUserAsync($"scope-coach-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.Coach);
        var assigned = await factory.SeedUserAsync($"scope-assigned-{Guid.NewGuid():N}@example.com", null);
        var stranger = await factory.SeedUserAsync($"scope-stranger-{Guid.NewGuid():N}@example.com", null);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.CoachMemberRelationships.Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coach.UserId, MemberId = assigned.UserId,
                SourceType = RelationshipSourceType.AssignedByManager,
                Status = RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.GetAsync($"/api/members/{assigned.UserId}/training-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync($"/api/members/{stranger.UserId}/training-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync($"/api/users/{stranger.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync($"/api/members/{stranger.UserId}/packages")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/member-packages")).StatusCode);
    }
}
