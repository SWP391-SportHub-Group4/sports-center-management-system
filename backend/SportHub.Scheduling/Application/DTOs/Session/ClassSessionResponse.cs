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
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    bool IsMakeup,
    Guid? RescheduledFromSessionId,
    IncidentSessionReport? IncidentReport = null);

public sealed record IncidentSessionReport(Guid FenceId, string Outcome, DateTime OccurredAtUtc,
    DateTime RecordedAtUtc, Guid RecordedBy, string Reason, Guid? ReplacementSessionId);
