namespace SportHub.Training.Application.DTOs;

public sealed record PtCoachChangeRequestResponse(
    Guid RequestId,
    Guid EntitlementId,
    Guid MemberId,
    string MemberName,
    Guid CurrentCoachId,
    string CurrentCoachName,
    Guid RequestedCoachId,
    string RequestedCoachName,
    string? Reason,
    DateTime RequestedAt,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    Guid? ReviewedByUserId,
    DateTime? ReviewedAt,
    string? ReviewNote);

public sealed record PtCoachChangeApprovalResponse(
    PtCoachChangeRequestResponse Request,
    IReadOnlyList<Guid> MovedSessionIds,
    IReadOnlyList<Guid> UnmovedSessionIds);
