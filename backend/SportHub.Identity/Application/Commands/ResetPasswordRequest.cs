using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Đặt lại mật khẩu bằng OTP gửi qua email (BR-103). Không nhận mật khẩu hiện tại.</summary>
public sealed class ResetPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, RegularExpression(@"^\d{6}$", ErrorMessage = "OTP code must be exactly 6 digits.")]
    public string OtpCode { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string NewPassword { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
