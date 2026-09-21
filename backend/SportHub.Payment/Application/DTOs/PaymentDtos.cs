using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.DTOs;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record InvoiceItemDto(Guid ItemId, string Description, decimal Amount, string RelatedEntityType);

public sealed record PaymentDto(
    Guid PaymentId,
    decimal Amount,
    string Method,
    string Status,
    string? ReferenceCode,
    Guid ReceivedByUserId,
    string ReceivedByName,
    DateTime PaidAt);

public sealed record PaymentAdjustmentDto(
    Guid AdjustmentId,
    Guid InvoiceId,
    string InvoiceNumber,
    Guid? PaymentId,
    string Type,
    decimal Amount,
    string Reason,
    string Status,
    Guid RequestedByUserId,
    string RequestedByName,
    Guid? ApprovedByUserId,
    string? ApprovedByName,
    DateTime CreatedAt,
    DateTime? ResolvedAt);

public sealed record InvoiceSummaryDto(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    decimal TotalAmount,
    decimal CollectedAmount,
    decimal AdjustmentAmount,
    decimal NetPayable,
    decimal Outstanding,
    decimal RefundedAmount,
    string Status,
    DateTime IssuedAt,
    DateTime DueDateUtc,
    DateTime? FirstDepositAtUtc,
    bool IsOverdue);

public sealed record InvoiceDetailDto(
    InvoiceSummaryDto Summary,
    Guid? MemberPackageId,
    IReadOnlyList<InvoiceItemDto> Items,
    IReadOnlyList<PaymentDto> Payments,
    IReadOnlyList<PaymentAdjustmentDto> Adjustments,
    decimal SuggestedRefundAmount);

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

public sealed class RecordPaymentRequest
{
    [Range(1, 1_000_000_000)]
    public decimal Amount { get; set; }

    /// <summary>Tên member của enum PaymentMethod (SSOT §3): Cash/Card/Transfer/EWallet.</summary>
    [Required]
    public string Method { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ReferenceCode { get; set; }
}

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

public sealed class ApproveAdjustmentRequest
{
    /// <summary>BR-52 — Manager được ghi đè số tiền mặc định khi phê duyệt. Null = giữ nguyên.</summary>
    [Range(1, 1_000_000_000)]
    public decimal? OverrideAmount { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

public sealed record RevenueReportRowDto(DateOnly Date, decimal Collected, decimal Adjusted, decimal Net);

public sealed record RevenueReportDto(
    DateOnly FromDate,
    DateOnly ToDate,
    decimal TotalCollected,
    decimal TotalAdjusted,
    decimal NetRevenue,
    int InvoiceCount,
    int PaymentCount,
    IReadOnlyList<RevenueReportRowDto> Daily);
