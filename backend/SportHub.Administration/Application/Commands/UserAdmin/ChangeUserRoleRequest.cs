using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Commands;

public sealed class ChangeUserRoleRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;

    /// <summary>BR-7 — thao tác quản trị phải ghi audit; lý do làm nhật ký đọc được.</summary>
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
