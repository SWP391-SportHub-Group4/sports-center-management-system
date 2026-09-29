namespace SportHub.Scheduling.Application.DTOs;

public sealed record RosterEntryResponse(
    Guid EnrollmentId,
    Guid MemberId,
    string MemberName,
    string EnrollmentStatus,
    string? AttendanceStatus,
    DateTime? AttendanceRecordedAt);
