namespace SportHub.Scheduling.Application.DTOs;

public sealed record RosterEntryResponse(
    Guid EnrollmentId,
    Guid MemberId,
    string MemberName,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string EnrollmentStatus,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? AttendanceStatus,
    DateTime? AttendanceRecordedAt);
