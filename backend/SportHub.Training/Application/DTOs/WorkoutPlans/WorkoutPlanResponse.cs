namespace SportHub.Training.Application.DTOs;

public sealed record WorkoutPlanResponse(
    Guid PlanId,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    Guid RelationshipId,
    string Goal,
    string Level,
    DateTime CreatedAt,
    IReadOnlyList<WorkoutPlanItemResponse> Items);
