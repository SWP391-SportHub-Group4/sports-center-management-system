namespace SportHub.Scheduling.Application.DTOs;

public sealed record RosterEntryResponse(
    Guid EnrollmentId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    string EnrollmentStatus,
    string? AttendanceStatus,
    DateTime? CheckInTime);
