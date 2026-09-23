using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

/// <summary>BR-30 — chọn gói sinh hoá đơn ngay, trước khi thu bất kỳ khoản nào.</summary>
public sealed class PurchasePackageRequest
{
    [Required]
    public Guid MemberId { get; set; }

    [Required]
    public int PackageId { get; set; }

    /// <summary>
    /// BR-10 — cờ cộng dồn. Chỉ Center Manager được bật, và bắt buộc kèm
    /// <see cref="StackingApprovalReason"/>. Lễ tân bật cờ này sẽ bị từ chối.
    /// </summary>
    public bool AllowStacking { get; set; }

    [MaxLength(500)]
    public string? StackingApprovalReason { get; set; }
}
