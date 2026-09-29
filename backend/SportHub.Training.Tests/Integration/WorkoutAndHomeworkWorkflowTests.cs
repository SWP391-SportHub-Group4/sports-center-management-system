using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class WorkoutAndHomeworkWorkflowTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Completed_pt_session_accepts_result_and_appears_in_both_progress_timelines()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, member.UserId);
        var entitlement = await factory.SeedPtEntitlementAsync(member.UserId, coach.UserId);
        var start = DateTime.UtcNow.Date.AddDays(7).AddHours(10);
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var createSession = await managerClient.PostAsJsonAsync("api/manager/pt-sessions",
            new CreatePtSessionRequest { EntitlementId = entitlement.EntitlementId, StartAtUtc = start });
        Assert.Equal(HttpStatusCode.Created, createSession.StatusCode);
        var session = (await createSession.Content.ReadFromJsonAsync<PtSessionResponse>())!;

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
            $"api/coaches/me/progress?memberId={member.UserId}&page=1&pageSize=10");
        Assert.NotNull(coachProgress);
        Assert.Equal("Tiến bộ ổn định", Assert.Single(coachProgress!.Items).CoachComment);

        var memberProgress = await factory.CreateApiClient(member.UserId, UserRole.Member)
            .GetFromJsonAsync<ProgressTimelineResponse>("api/members/me/progress?page=1&pageSize=10");
        Assert.NotNull(memberProgress);
        Assert.Equal(session.SessionId, Assert.Single(memberProgress!.Items).PtSessionId);
    }

    [Fact]
    public async Task Pt_can_update_activate_and_archive_own_plan()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, member.UserId);
        var client = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var create = await client.PostAsJsonAsync("api/workout-plans", Plan(member.UserId));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var plan = (await create.Content.ReadFromJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Draft, plan.Status);

        var update = await client.PutAsJsonAsync($"api/workout-plans/{plan.PlanId}", new UpdateWorkoutPlanRequest
        {
            Goal = "Tăng sức mạnh thân dưới", Level = "Intermediate", Version = plan.Version,
            Items = [new SaveWorkoutPlanItemRequest { Exercise = "Deadlift", Sets = 4, Reps = 6 }]
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        plan = (await update.Content.ReadFromJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal("Deadlift", Assert.Single(plan.Items).Exercise);

        var activate = await client.PostAsync($"api/workout-plans/{plan.PlanId}/activate", null);
        Assert.Equal(HttpStatusCode.OK, activate.StatusCode);
        plan = (await activate.Content.ReadFromJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Active, plan.Status);

        var archive = await client.PostAsync($"api/workout-plans/{plan.PlanId}/archive", null);
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);
        plan = (await archive.Content.ReadFromJsonAsync<WorkoutPlanResponse>())!;
        Assert.Equal(WorkoutPlanStatus.Archived, plan.Status);
    }

    [Fact]
    public async Task Homework_has_separated_pt_and_member_write_boundaries()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, member.UserId);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var create = await coachClient.PostAsJsonAsync("api/coaches/me/homework", new CreateHomeworkRequest
        {
            MemberId = member.UserId,
            Title = "Buổi tập tại nhà A",
            CoachNote = "Giữ đúng kỹ thuật",
            DueAt = DateTime.UtcNow.AddDays(2),
            Items = [new SaveHomeworkItemRequest { Exercise = "Plank", Sets = 3, Reps = 30 }]
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var homework = (await create.Content.ReadFromJsonAsync<HomeworkResponse>())!;
        Assert.Equal(HomeworkAssignmentStatus.Assigned, homework.Status);

        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var complete = await memberClient.PatchAsJsonAsync(
            $"api/members/me/homework/{homework.AssignmentId}",
            new UpdateMemberHomeworkRequest
            {
                Status = HomeworkAssignmentStatus.Completed,
                MemberFeedback = "Đã hoàn thành",
                Version = homework.Version
            });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        homework = (await complete.Content.ReadFromJsonAsync<HomeworkResponse>())!;
        Assert.Equal("Giữ đúng kỹ thuật", homework.CoachNote);
        Assert.Equal("Đã hoàn thành", homework.MemberFeedback);

        var review = await coachClient.PostAsJsonAsync(
            $"api/coaches/me/homework/{homework.AssignmentId}/review",
            new ReviewHomeworkRequest { Version = homework.Version });
        Assert.Equal(HttpStatusCode.OK, review.StatusCode);
        homework = (await review.Content.ReadFromJsonAsync<HomeworkResponse>())!;
        Assert.Equal(HomeworkAssignmentStatus.Reviewed, homework.Status);
        Assert.NotNull(homework.ReviewedAt);
    }

    [Fact]
    public async Task Class_instructor_cannot_use_homework_api()
    {
        var coach = await factory.SeedCoachAsync(CoachCategory.ClassInstructor);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await client.PostAsJsonAsync("api/coaches/me/homework", new CreateHomeworkRequest
        {
            MemberId = member.UserId,
            Title = "Không hợp lệ",
            DueAt = DateTime.UtcNow.AddDays(1),
            Items = [new SaveHomeworkItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_update_another_members_homework()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachCategory.PersonalTrainer);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        await CreateRelationshipAsync(manager.UserId, coach.UserId, owner.UserId);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);
        var created = await coachClient.PostAsJsonAsync("api/coaches/me/homework", new CreateHomeworkRequest
        {
            MemberId = owner.UserId, Title = "Bài riêng", DueAt = DateTime.UtcNow.AddDays(1),
            Items = [new SaveHomeworkItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
        });
        var homework = (await created.Content.ReadFromJsonAsync<HomeworkResponse>())!;

        var response = await factory.CreateApiClient(stranger.UserId, UserRole.Member).PatchAsJsonAsync(
            $"api/members/me/homework/{homework.AssignmentId}",
            new UpdateMemberHomeworkRequest
            {
                Status = HomeworkAssignmentStatus.Completed, Version = homework.Version
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
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
