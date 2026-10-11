using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Commands;

public sealed class ChangeUserRoleRequest
{
    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string Role { get; set; } = string.Empty;

    /// <summary>BR-7 — thao tác quản trị phải ghi audit; lý do làm nhật ký đọc được.</summary>
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    /// <summary>
    /// BR-96, chốt 28/09/2026 (2) — bắt buộc khi đổi vai trò SANG Coach, kể cả khi tài khoản
    /// từng có CoachProfile lịch sử (không tự khôi phục category cũ). Không gửi kèm cho role khác.
    /// </summary>
    public List<int>? SportIds { get; set; }
}
