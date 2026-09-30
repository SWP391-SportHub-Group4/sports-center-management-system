using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>
/// ExternalCoach tự đăng ký (BR-105). Role không nhận từ body: endpoint này chỉ tạo ExternalCoach ở trạng thái PendingApproval.
/// Mã OTP lấy từ POST /api/auth/external-coach/otp.
/// </summary>
public sealed class RegisterExternalCoachRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(200)] // chính sách 8–64 ký tự kiểm ở PasswordPolicy (service)
    public string Password { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string ConfirmPassword { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }

    [Required, RegularExpression(@"^\d{6}$", ErrorMessage = "OTP code must be exactly 6 digits.")]
    public string OtpCode { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Bio { get; set; }

    /// <summary>Các môn muốn giảng dạy/thuê sân; phải là môn đang hoạt động trong catalog.</summary>
    [Required, MinLength(1), MaxLength(10)]
    public List<int> SportIds { get; set; } = [];
}
