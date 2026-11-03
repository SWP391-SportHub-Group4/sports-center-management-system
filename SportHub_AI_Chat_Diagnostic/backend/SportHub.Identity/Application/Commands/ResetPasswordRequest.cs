using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Đặt lại mật khẩu bằng token trong link gửi qua email (BR-103). Không nhận mật khẩu hiện tại.</summary>
public sealed class ResetPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Token { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string NewPassword { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
