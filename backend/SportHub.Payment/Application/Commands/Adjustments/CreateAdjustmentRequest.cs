using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

public sealed class CreateAdjustmentRequest
{
    /// <summary>Tên member của enum PaymentAdjustmentType (SSOT §3): Refund/Correction/Discount.</summary>
    [Required]
    public string Type { get; set; } = string.Empty;

    [Range(1, 1_000_000_000)]
    public decimal Amount { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    /// <summary>Gắn vào một giao dịch thu cụ thể nếu có; null khi điều chỉnh ở mức hoá đơn.</summary>
    public Guid? PaymentId { get; set; }
}
