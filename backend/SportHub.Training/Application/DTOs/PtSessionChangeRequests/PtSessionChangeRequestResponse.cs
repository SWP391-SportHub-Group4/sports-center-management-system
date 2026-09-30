namespace SportHub.Training.Application.DTOs;

public sealed record PtSessionChangeRequestResponse(
    Guid RequestId,
    Guid SessionId,
    DateTime SessionStartAtUtc,
    Guid MemberId,
    Guid CoachId,
    Guid RequestedByUserId,
    string RequestType,
    DateTime? RequestedStartAtUtc,
    DateTime RequestedAt,
    string? Reason,
    string TimingClassification,
    bool RequestsException,
    string Status,
    Guid? ReviewedByUserId,
    DateTime? ReviewedAt,
    string? ReviewNote);
