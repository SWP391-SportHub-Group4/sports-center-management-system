using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class WorkoutWorkflowTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Completed_pt_session_accepts_result_and_appears_in_both_progress_timelines()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, member.UserId);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var start = DateTime.UtcNow.Date.AddDays(7).AddHours(10);
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var createSession = await managerClient.PostAsJsonAsync("api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = start });
        Assert.Equal(HttpStatusCode.Created, createSession.StatusCode);
        var session = (await createSession.Content.ReadApiJsonAsync<PtSessionResponse>())!;

        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);
        var complete = await coachClient.PostAsync(
            $"api/coaches/me/pt-sessions/{session.SessionId}/complete", null);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

        var saveResult = await coachClient.PutAsJsonAsync($"api/workout-results/{session.SessionId}",
            new SaveWorkoutResultRequest
            {
                ProgressNote = "Hoàn thành đủ số hiệp", CoachComment = "Tiến bộ ổn định"
            });
        Assert.Equal(HttpStatusCode.OK, saveResult.StatusCode);

        var coachProgress = await coachClient.GetFromJsonAsync<ProgressTimelineResponse>(
            $"api/coaches/me/progress?memberId={member.UserId}&page=1&pageSize=10", ApiJson.Options);
        Assert.NotNull(coachProgress);
        Assert.Equal("Tiến bộ ổn định", Assert.Single(coachProgress!.Items).CoachComment);

        var memberProgress = await factory.CreateApiClient(member.UserId, UserRole.Member)
            .GetFromJsonAsync<ProgressTimelineResponse>("api/members/me/progress?page=1&pageSize=10", ApiJson.Options);
        Assert.NotNull(memberProgress);
        Assert.Equal(session.SessionId, Assert.Single(memberProgress!.Items).PtSessionId);
    }

    [Fact]
    public async Task Pt_can_update_activate_and_archive_own_plan()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, member.UserId);
        var client = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var create = await client.PostAsJsonAsync("api/workout-plans", Plan(member.UserId));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var plan = (await create.Content.ReadApiJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Draft, plan.Status);

        var update = await client.PutAsJsonAsync($"api/workout-plans/{plan.PlanId}", new UpdateWorkoutPlanRequest
        {
            Goal = "Tăng sức mạnh thân dưới", Level = "Intermediate", Version = plan.Version,
            Items = [new SaveWorkoutPlanItemRequest { Exercise = "Deadlift", Sets = 4, Reps = 6 }]
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        plan = (await update.Content.ReadApiJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal("Deadlift", Assert.Single(plan.Items).Exercise);

        var activate = await client.PostAsync($"api/workout-plans/{plan.PlanId}/activate", null);
        Assert.Equal(HttpStatusCode.OK, activate.StatusCode);
        plan = (await activate.Content.ReadApiJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Active, plan.Status);

        var archive = await client.PostAsync($"api/workout-plans/{plan.PlanId}/archive", null);
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);
        plan = (await archive.Content.ReadApiJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Archived, plan.Status);
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
        MemberId = memberId,
        Goal = "Tăng sức mạnh cơ bản",
        Level = "Beginner",
        Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
    };
}
