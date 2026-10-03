using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class CoachAssignmentReadTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Removed_specialty_keeps_owned_schedule_and_quota_readable_but_cannot_complete()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var other = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        using var staff = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await staff.PostAsJsonAsync("/api/manager/pt-sessions", new CreatePtSessionRequest
        { EntitlementId = entitlement.EntitlementId, StartAtUtc = DateTime.UtcNow.Date.AddDays(7).AddHours(2) });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var session = (await response.Content.ReadApiJsonAsync<PtSessionResponse>())!;
        await factory.ExecuteAsync(async db => { await db.UserSportSpecialties.Where(s => s.UserId == coach.UserId).ExecuteDeleteAsync(); });
        using var own = factory.CreateApiClient(coach.UserId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await own.GetAsync($"/api/coaches/me/pt-sessions/{session.SessionId}")).StatusCode);
        var sessions = await (await own.GetAsync("/api/coaches/me/pt-sessions")).Content.ReadApiJsonAsync<List<PtSessionResponse>>();
        Assert.Single(sessions!);
        Assert.Equal(session.SessionId, sessions![0].SessionId);
        var quota = await (await own.GetAsync("/api/coaches/me/pt-entitlements")).Content.ReadApiJsonAsync<List<PtEntitlementResponse>>();
        Assert.Single(quota!);
        Assert.Equal(entitlement.EntitlementId, quota![0].EntitlementId);
        Assert.Equal(HttpStatusCode.Forbidden, (await own.PostAsync($"/api/coaches/me/pt-sessions/{session.SessionId}/complete", null)).StatusCode);
        using var stranger = factory.CreateApiClient(other.UserId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/coaches/me/pt-sessions/{session.SessionId}")).StatusCode);
        Assert.Empty((await (await stranger.GetAsync("/api/coaches/me/pt-entitlements")).Content.ReadApiJsonAsync<List<PtEntitlementResponse>>())!);
    }
}
