using System.ComponentModel.DataAnnotations;
using SportHub.Identity.Application.Commands;

namespace SportHub.Administration.Application.Commands;

/// <summary>
/// BR-2 — chỉ System Administrator tạo tài khoản nhân sự. Role nhận ở đây là chuỗi tên
/// enum UserRole; service từ chối "Member" vì Member phải tự đăng ký theo BR-1.
/// </summary>
public sealed class CreateStaffAccountRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }

    [Range(1, int.MaxValue)]
    public int RoleId { get; set; }

    /// <summary>
    /// BR-96 — bắt buộc khi RoleId là Coach; không được gửi kèm cho role khác.
    /// Service kiểm tra chéo với RoleId vì DataAnnotations không validate liên field.
    /// </summary>
    public List<int>? Specialties { get; set; }
}
