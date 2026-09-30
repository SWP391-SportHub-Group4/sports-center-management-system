using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.DTOs;

public sealed record HomeworkItemResponse(Guid ItemId, string Exercise, int Sets, int Reps, string? Notes);

public sealed record HomeworkResponse(
    Guid AssignmentId,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    Guid RelationshipId,
    Guid? SourceWorkoutPlanId,
    string Title,
    string? CoachNote,
    DateTime AssignedAt,
    DateTime DueAt,
    DateTime? CompletedAt,
    DateTime? ReviewedAt,
    HomeworkAssignmentStatus Status,
    string? MemberFeedback,
    int Version,
    IReadOnlyList<HomeworkItemResponse> Items);
