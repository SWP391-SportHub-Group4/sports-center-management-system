namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Ghi danh khóa học của một Member.</summary>
public sealed record EnrollmentResponse(
    Guid EnrollmentId,
    int ClassId,
    string ClassCode,
    string ClassName,
    string SportName,
    Guid MemberId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime EnrolledAt,
    DateTime? EndedAt,
    int NumSessions,
    DateTime? FirstSessionStartUtc,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ClassStatus, Guid? InvoiceItemId = null);
