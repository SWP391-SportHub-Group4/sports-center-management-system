namespace SportHub.Scheduling.Application.DTOs;

public sealed record AttendanceResponse(
    Guid AttendanceId,
    Guid EnrollmentId,
    Guid MemberId,
    string MemberName,
    string Status,
    DateTime? CheckInTime,
    Guid? CheckedInByUserId);
