namespace SportHub.Training.Application.DTOs;

using SportHub.Training.Domain.Enums;

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
    WorkoutPlanStatus Status,
    DateTime UpdatedAt,
    int Version,
    IReadOnlyList<WorkoutPlanItemResponse> Items);
