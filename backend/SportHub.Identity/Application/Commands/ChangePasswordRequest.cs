using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Đặt/đổi mật khẩu khi đã đăng nhập. Chính sách mật khẩu kiểm ở PasswordPolicyGuard (service).</summary>
public sealed class ChangePasswordRequest
{
    /// <summary>Bắt buộc khi tài khoản ĐÃ có mật khẩu; bỏ trống khi tài khoản chưa có mật khẩu (dùng OtpCode).</summary>
    [MaxLength(200)]
    public string? CurrentPassword { get; set; }

    /// <summary>Mã 6 số gửi về email; bắt buộc khi tài khoản chưa có mật khẩu (Luồng A).</summary>
    [MaxLength(10)]
    public string? OtpCode { get; set; }

    [Required, MaxLength(200)]
    public string NewPassword { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
