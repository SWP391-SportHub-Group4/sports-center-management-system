using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Đổi mật khẩu khi đã đăng nhập (BR-60/104). Chính sách 8–64 ký tự kiểm ở PasswordPolicy (service).</summary>
public sealed class ChangePasswordRequest
{
    /// <summary>
    /// Bắt buộc khi tài khoản ĐÃ có mật khẩu; bỏ trống với tài khoản Google-only đang đặt
    /// mật khẩu lần đầu (BR-60).
    /// </summary>
    [MaxLength(200)]
    public string? CurrentPassword { get; set; }

    [Required, MaxLength(200)]
    public string NewPassword { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
