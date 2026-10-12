using System.ComponentModel.DataAnnotations;
using SportHub.Identity.Application.Commands;

namespace SportHub.Administration.Application.Commands;

/// <summary>Receptionist đăng ký Member mới tại quầy: email nhập hai lần, tài khoản chưa có mật khẩu và nhận email kích hoạt.</summary>
public sealed class CreateFrontDeskMemberRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string ConfirmEmail { get; set; } = string.Empty;

    [FullName]
    public string FullName { get; set; } = string.Empty;

    [PhoneNumber]
    public string? Phone { get; set; }
}

/// <summary>Sửa email của Member chưa kích hoạt; bắt buộc nhập lại email và lý do để ghi audit.</summary>
public sealed class ChangePendingMemberEmailRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string ConfirmEmail { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
