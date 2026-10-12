using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Commands;

/// <summary>Sửa email của tài khoản staff chưa kích hoạt; bắt buộc lý do để ghi audit.</summary>
public sealed class ChangePendingStaffEmailRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
