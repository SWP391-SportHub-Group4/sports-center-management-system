using System.ComponentModel.DataAnnotations;
using SportHub.Identity.Application.Commands;

namespace SportHub.Administration.Application.DTOs;

public sealed record UserAdminDto(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt,
    bool HasPassword,
    bool HasGoogleLink);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

/// <summary>
/// BR-2 — chỉ System Administrator tạo tài khoản nhân sự. Role nhận ở đây là chuỗi tên
/// enum UserRole; service từ chối "Member" vì Member phải tự đăng ký theo BR-1.
/// </summary>
public sealed class CreateStaffAccountRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8), MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }

    [Required]
    public string Role { get; set; } = string.Empty;
}

public sealed class ChangeUserRoleRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;

    /// <summary>BR-7 — thao tác quản trị phải ghi audit; lý do làm nhật ký đọc được.</summary>
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

/// <summary>BR-6/BR-7 — khoá/mở khoá BẮT BUỘC kèm lý do.</summary>
public sealed class ChangeAccountStatusRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
