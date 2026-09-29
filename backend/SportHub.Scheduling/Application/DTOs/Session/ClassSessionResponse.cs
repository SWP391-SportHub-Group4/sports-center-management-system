namespace SportHub.Scheduling.Application.DTOs;

public sealed record ClassSessionResponse(
    Guid SessionId,
    int ClassId,
    string ClassName,
    int SessionNo,
    int RoomId,
    string RoomName,
    Guid CoachId,
    string? CoachName,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    string Status,
    bool IsMakeup,
    Guid? RescheduledFromSessionId);
