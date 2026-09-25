using System.ComponentModel.DataAnnotations;

namespace SportHub.API.Modules.Identity.Admin;

public sealed record AdminUserListItemResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt);

public sealed record AdminUserDetailResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt);

public sealed record AdminUserListResponse(
    int Page,
    int PageSize,
    int TotalCount,
    IReadOnlyList<AdminUserListItemResponse> Items);

public sealed record AdminRoleResponse(int RoleId, string Role);

public sealed class CreateInternalAccountRequest
{
    [Required, EmailAddress, MaxLength(320)]
    public string Email { get; init; } = string.Empty;

    [Required, MinLength(8), MaxLength(128)]
    public string Password { get; init; } = string.Empty;

    [Required, MaxLength(200)]
    public string FullName { get; init; } = string.Empty;

    [MaxLength(32)]
    public string? Phone { get; init; }

    // Accepted values: SYSTEM_ADMINISTRATOR, CENTER_MANAGER, COACH, RECEPTIONIST
    [Required]
    public string Role { get; init; } = string.Empty;
}

public sealed class UpdateUserRoleRequest
{
    // Accepted values: SYSTEM_ADMINISTRATOR, CENTER_MANAGER, COACH, RECEPTIONIST
    [Required]
    public string Role { get; init; } = string.Empty;

    [Required, MaxLength(500)]
    public string Reason { get; init; } = string.Empty;
}

public sealed class UpdateUserStatusRequest
{
    // Accepted values: ACTIVE, BANNED, DEACTIVATED
    [Required]
    public string Status { get; init; } = string.Empty;

    // BR-7: lock/unlock/status changes must include a reason in the Audit Log.
    [Required, MaxLength(500)]
    public string Reason { get; init; } = string.Empty;
}
