using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Characterization tests cho WorkoutPlan HIEN HANH, chup lai TRUOC khi BE-4 Phase 2 them
/// Status/UpdatedAt/Version. Hanh vi tao plan (yeu cau relationship Active, snapshot Goal/Level,
/// tao WorkoutPlanItem) khong doi trong BE-4 — cac test nay phai tiep tuc pass sau refactor.
/// </summary>
[Collection(nameof(TrainingApiCollection))]
public sealed class WorkoutPlanCharacterizationTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Personal_trainer_with_active_relationship_creates_a_plan()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CreateActiveRelationshipAsync(manager, coach.UserId, member.UserId);

        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);
        var response = await coachClient.PostAsJsonAsync("api/workout-plans", new CreateWorkoutPlanRequest
        {
            MemberId = member.UserId,
            Goal = "Build baseline strength",
            Level = "Beginner",
            Items =
            [
                new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }
            ]
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var plan = await response.Content.ReadApiJsonAsync<WorkoutPlanResponse>();
        Assert.NotNull(plan);
        Assert.Equal(member.UserId, plan!.MemberId);
        Assert.Equal(coach.UserId, plan.CoachId);
        Assert.Equal("Build baseline strength", plan.Goal);
        Assert.Single(plan.Items);
        Assert.Equal("Squat", plan.Items[0].Exercise);
    }

    [Fact]
    public async Task Personal_trainer_without_active_relationship_cannot_create_a_plan()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsJsonAsync("api/workout-plans", new CreateWorkoutPlanRequest
        {
            MemberId = member.UserId,
            Goal = "Build baseline strength",
            Level = "Beginner",
            Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Class_instructor_cannot_create_a_workout_plan_even_with_a_relationship_row()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsJsonAsync("api/workout-plans", new CreateWorkoutPlanRequest
        {
            MemberId = member.UserId,
            Goal = "Should never be created",
            Level = "Beginner",
            Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Member_can_read_but_not_create_their_own_plans()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);

        var getResponse = await memberClient.GetAsync("api/members/me/workout-plans");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        var postResponse = await memberClient.PostAsJsonAsync("api/workout-plans", new CreateWorkoutPlanRequest
        {
            MemberId = member.UserId,
            Goal = "Self-assigned goal",
            Level = "Beginner",
            Items = [new SaveWorkoutPlanItemRequest { Exercise = "Squat", Sets = 3, Reps = 10 }]
        });
        Assert.Equal(HttpStatusCode.Forbidden, postResponse.StatusCode);
    }

    private async Task CreateActiveRelationshipAsync(
        SportHub.Identity.Domain.Entities.UserAccount manager,
        Guid coachId,
        Guid memberId)
    {
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await managerClient.PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coachId, MemberId = memberId, SourceType = "Personal" });

        response.EnsureSuccessStatusCode();
    }
}
