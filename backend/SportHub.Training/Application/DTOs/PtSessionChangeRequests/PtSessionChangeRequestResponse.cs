namespace SportHub.Training.Application.DTOs;

public sealed record PtSessionChangeRequestResponse(
    Guid RequestId,
    Guid SessionId,
    DateTime SessionStartAtUtc,
    Guid MemberId,
    Guid CoachId,
    Guid RequestedByUserId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string RequestType,
    DateTime? RequestedStartAtUtc,
    DateTime RequestedAt,
    string? Reason,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string TimingClassification,
    bool RequestsException,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    Guid? ReviewedByUserId,
    DateTime? ReviewedAt,
    string? ReviewNote,
    string MemberName = "",
    string CoachName = "");
