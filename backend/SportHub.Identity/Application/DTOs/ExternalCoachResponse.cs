namespace SportHub.Identity.Application.DTOs;

/// <summary>
/// Hồ sơ ExternalCoach. Trả cho chính chủ (mọi trạng thái, kể cả Pending/Rejected/Suspended) và cho Manager.
/// Không chứa dữ liệu hội viên hay lớp của trung tâm.
/// </summary>
public sealed record ExternalCoachResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string? Bio,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ApprovalStatus,
    IReadOnlyList<int> SportIds,
    Guid? ReviewedByUserId,
    DateTime? ReviewedAt,
    string? ReviewNote,
    DateTime CreatedAt);
