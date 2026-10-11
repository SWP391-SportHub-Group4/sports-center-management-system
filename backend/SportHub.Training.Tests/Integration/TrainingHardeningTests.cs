using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class TrainingHardeningTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Anonymous_progress_request_is_unauthorized()
    {
        var response = await factory.CreateApiClient().GetAsync("api/members/me/progress");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Class_instructor_is_rejected_before_progress_lookup()
    {
        var instructor = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var response = await factory.CreateApiClient(instructor.UserId, UserRole.Coach)
            .GetAsync($"api/coaches/me/progress?memberId={Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Progress_range_over_366_days_is_rejected()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var from = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var to = from.AddDays(367);

        var response = await factory.CreateApiClient(member.UserId, UserRole.Member)
            .GetAsync($"api/members/me/progress?fromUtc={from:O}&toUtc={to:O}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("range_too_large", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Other_pt_cannot_update_a_plan_they_do_not_own()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var other = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, owner.UserId, member.UserId);

        var create = await factory.CreateApiClient(owner.UserId, UserRole.Coach)
            .PostAsJsonAsync("api/workout-plans", Plan(member.UserId));
        var plan = (await create.Content.ReadApiJsonAsync<WorkoutPlanResponse>())!;

        var response = await factory.CreateApiClient(other.UserId, UserRole.Coach)
            .PutAsJsonAsync($"api/workout-plans/{plan.PlanId}", new UpdateWorkoutPlanRequest
            {
                Goal = "Không được phép", Level = "Beginner", Version = plan.Version,
                Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Concurrent_booking_of_last_quota_allows_only_one_request()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId, totalQuota: 1);
        var firstClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var secondClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var day = DateTime.UtcNow.Date.AddDays(14);

        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync("api/manager/pt-sessions",
                new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = day.AddHours(8) }),
            secondClient.PostAsJsonAsync("api/manager/pt-sessions",
                new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = day.AddHours(12) }));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Concurrent_overlapping_booking_for_same_coach_allows_only_one_request()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var memberA = await factory.SeedUserAsync(UserRole.Member);
        var memberB = await factory.SeedUserAsync(UserRole.Member);
        var entitlementA = await factory.SeedPtEntitlementAsync(memberA.UserId, coach.UserId);
        var entitlementB = await factory.SeedPtEntitlementAsync(memberB.UserId, coach.UserId);
        var firstClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var secondClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var start = DateTime.UtcNow.Date.AddDays(21).AddHours(10);

        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync("api/manager/pt-sessions",
                new CreatePtSessionRequest { EntitlementId = entitlementA.EntitlementId, StartAtUtc = start }),
            secondClient.PostAsJsonAsync("api/manager/pt-sessions",
                new CreatePtSessionRequest { EntitlementId = entitlementB.EntitlementId, StartAtUtc = start.AddMinutes(30) }));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
    }

    private async Task CreateRelationshipAsync(Guid managerId, Guid coachId, Guid memberId)
    {
        var response = await factory.CreateApiClient(managerId, UserRole.CenterManager).PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coachId, MemberId = memberId, SourceType = "Personal" });
        response.EnsureSuccessStatusCode();
    }

    private static CreateWorkoutPlanRequest Plan(Guid memberId) => new()
    {
        MemberId = memberId, Goal = "Kế hoạch của PT sở hữu", Level = "Beginner",
        Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
    };
}
