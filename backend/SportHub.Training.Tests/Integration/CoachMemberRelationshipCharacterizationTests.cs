using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Characterization tests cho hanh vi CoachMemberRelationship HIEN HANH, chup lai TRUOC khi
/// BE-4 Phase 2 dong cham vao module Training (PT session/entitlement moi). CoachMemberRelationship
/// khong doi trong BE-4 — cac test nay phai tiep tuc pass sau refactor de dam bao khong regression.
/// </summary>
[Collection(nameof(TrainingApiCollection))]
public sealed class CoachMemberRelationshipCharacterizationTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Creating_relationship_with_class_based_source_type_is_rejected()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coach.UserId, MemberId = member.UserId, SourceType = "ClassBased" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Non_manager_cannot_create_or_end_relationships()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coach.UserId, MemberId = member.UserId, SourceType = "Personal" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
