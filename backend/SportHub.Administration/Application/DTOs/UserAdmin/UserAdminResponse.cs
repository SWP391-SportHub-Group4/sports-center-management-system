namespace SportHub.Administration.Application.DTOs;

public sealed record UserAdminResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt,
    bool HasPassword,
    bool HasGoogleLink,

    // BR-96, mới 28/09/2026 — null khi role khác Coach hoặc CoachProfile chưa/không còn tồn tại.
    string? CoachCategory);
