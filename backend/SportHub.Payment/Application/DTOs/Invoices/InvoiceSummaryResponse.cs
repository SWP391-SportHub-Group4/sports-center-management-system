namespace SportHub.Payment.Application.DTOs;

/// <summary>
/// Số dư hoá đơn theo BR-41 v1.4. Sáu đại lượng tiền được trả riêng vì UI phải phân biệt
/// được "còn phải thu" với "cần hoàn lại", và "đã hoàn" với "cần hoàn" — gộp lại là nguồn
/// gốc của sai sót đối soát ở bản trước.
/// </summary>
public sealed record InvoiceSummaryResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    decimal TotalAmount,
    /// <summary>Tổng Payment Success, chưa trừ hoàn.</summary>
    decimal GrossCollected,
    /// <summary>Tổng Discount/Correction Completed — giảm nghĩa vụ, KHÔNG phải tiền trả lại.</summary>
    decimal ObligationReduction,
    /// <summary>Tổng Refund Completed đã xác nhận thực trả.</summary>
    decimal RefundedAmount,
    /// <summary>GrossCollected − RefundedAmount: tiền trung tâm đang thực giữ.</summary>
    decimal NetCollected,
    /// <summary>TotalAmount − ObligationReduction.</summary>
    decimal NetPayable,
    decimal Outstanding,
    /// <summary>Tiền đang giữ vượt nghĩa vụ — cần hoàn nhưng CHƯA hoàn.</summary>
    decimal RefundDue,
    string Status,
    DateTime IssuedAt,
    DateTime DueDateUtc,
    DateTime? FirstDepositAtUtc,
    bool IsOverdue);
