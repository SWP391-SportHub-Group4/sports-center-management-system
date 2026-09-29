namespace SportHub.Scheduling.Application.DTOs;

public sealed record AttendanceResponse(
    Guid AttendanceId,
    Guid EnrollmentId,
    Guid SessionId,
    string Status,
    Guid RecordedByUserId,
    DateTime RecordedAt,
    DateTime? LastModifiedAt);
