namespace SportHub.Scheduling.Application.DTOs;

public sealed record EnrollmentResponse(
    Guid EnrollmentId,
    Guid SessionId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    Guid MemberPackageId,
    string Status,
    DateTime RegisteredAt,
    DateTime? CancelledAt,
    int CancellationDeadlineMinutes,
    DateTime CancellationDeadlineUtc,
    string? AttendanceStatus,
    ClassSessionResponse Session);
