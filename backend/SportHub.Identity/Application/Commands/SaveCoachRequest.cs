using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Manager tạo Coach nội bộ kèm chuyên môn (BR-96). Role luôn là Coach, không nhận từ body.</summary>
public sealed class CreateCoachRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(200)] // chính sách mật khẩu kiểm ở PasswordPolicy (service)
    public string Password { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }

    [MaxLength(1000)]
    public string? Bio { get; set; }

    /// <summary>1–10 môn đang hoạt động trong catalog.</summary>
    [Required, MinLength(1), MaxLength(10)]
    public List<int> SportIds { get; set; } = [];
}

/// <summary>Thay toàn bộ chuyên môn của Coach; Bio null giữ nguyên.</summary>
public sealed class UpdateCoachRequest
{
    [Required, MinLength(1), MaxLength(10)]
    public List<int> SportIds { get; set; } = [];

    [MaxLength(1000)]
    public string? Bio { get; set; }
}
