using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands;

/// <summary>
/// BR-42 v1.4 — Lễ tân xác nhận đã THỰC TRẢ một Refund đã được duyệt.
///
/// Cố ý KHÔNG có trường số tiền: số tiền đã được Manager chốt ở bước duyệt và bước này không
/// được sửa. Cho phép nhập lại số tiền ở đây là mở đường để quầy trả khác số đã duyệt.
/// </summary>
public sealed class CompleteAdjustmentRequest
{
    /// <summary>Phương thức thực trả: Cash, Card, Transfer, EWallet.</summary>
    [Required]
    public string RefundMethod { get; set; } = string.Empty;

    /// <summary>
    /// Mã tham chiếu giao dịch. Bắt buộc với mọi phương thức trừ Cash — tiền mặt tại quầy
    /// lấy actor + thời điểm + Audit làm bằng chứng.
    /// </summary>
    [MaxLength(100)]
    public string? RefundReferenceCode { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Note { get; set; } = string.Empty;
}
