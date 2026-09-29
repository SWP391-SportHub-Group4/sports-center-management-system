using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.DTOs;

public sealed record ProgressTimelineItemResponse(
    Guid PtSessionId,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    PtSessionStatus SessionStatus,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    Guid? ResultId,
    string? ProgressNote,
    string? CoachComment,
    DateTime? RecordedAt);

public sealed record ProgressTimelineResponse(
    int Page,
    int PageSize,
    int TotalCount,
    IReadOnlyList<ProgressTimelineItemResponse> Items);
