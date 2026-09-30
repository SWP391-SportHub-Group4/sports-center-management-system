namespace SportHub.Training.Application.DTOs;

/// <summary>Đổi 29/09/2026 (BE-4): gắn với PtSession thay vì Enrollment — không còn ClassName/Enrollment.</summary>
public sealed record WorkoutResultResponse(
    Guid ResultId,
    Guid PtSessionId,
    DateTime SessionStartAtUtc,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    string? ProgressNote,
    string? CoachComment,
    DateTime RecordedAt);
