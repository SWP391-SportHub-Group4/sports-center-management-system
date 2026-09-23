namespace SportHub.Training.Application.DTOs;

public sealed record WorkoutResultResponse(
    Guid ResultId,
    Guid EnrollmentId,
    Guid SessionId,
    string ClassName,
    DateTime SessionStartAtUtc,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    string? ProgressNote,
    string? CoachComment,
    DateTime RecordedAt);
