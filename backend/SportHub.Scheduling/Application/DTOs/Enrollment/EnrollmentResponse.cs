namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Ghi danh khóa học của một Member.</summary>
public sealed record EnrollmentResponse(
    Guid EnrollmentId,
    int ClassId,
    string ClassCode,
    string ClassName,
    string SportName,
    Guid MemberId,
    string Status,
    DateTime EnrolledAt,
    DateTime? EndedAt,
    int NumSessions,
    DateTime? FirstSessionStartUtc,
    string ClassStatus);
