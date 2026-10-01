namespace SportHub.Training.Application.DTOs;

public sealed record PtSessionResponse(
    Guid SessionId,
    Guid EntitlementId,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string QuotaState,
    Guid? RescheduledFromSessionId,
    DateTime? CompletedAt,
    DateTime? CancelledAt,
    string? CancellationReason,
    int? RoomId,
    string? RoomName);
