using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

public sealed class ApproveAdjustmentRequest
{
    /// <summary>BR-52 — Manager được ghi đè số tiền mặc định khi phê duyệt. Null = giữ nguyên.</summary>
    [Range(1, 1_000_000_000)]
    public decimal? OverrideAmount { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
