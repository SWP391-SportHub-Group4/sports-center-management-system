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
    bool HasGoogleLink);
