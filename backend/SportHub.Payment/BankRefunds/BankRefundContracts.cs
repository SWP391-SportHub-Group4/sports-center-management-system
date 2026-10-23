using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace SportHub.Payment.BankRefunds;

/// <summary>Một giao dịch (InvoiceItem) của Member có thể chọn khi gửi yêu cầu hoàn tiền.</summary>
public sealed record BankRefundItemRow(
    Guid InvoiceItemId,
    string ItemType,
    string Description,
    string InvoiceNumber,
    DateTime? PaidAt,
    decimal LineAmount,
    decimal RemainingRefundableVnd,
    bool Eligible,
    string? IneligibleReason);

public sealed record PriorRefundRow(string Kind, string Status, decimal AmountVnd, int? Points, DateTime At);

/// <summary>Snapshot dịch vụ/giao dịch do server dựng; frontend không được gửi dữ liệu này.</summary>
public sealed record RefundServiceSnapshot(
    Guid InvoiceItemId,
    string ItemType,
    string Description,
    Guid InvoiceId,
    string InvoiceNumber,
    DateTime? InvoicePaidAt,
    decimal LineAmount,
    decimal PaidCashVnd,
    decimal PaidPointsVnd,
    decimal PaidTotalVnd,
    decimal PriorPointRefundVnd,
    decimal PriorBankRefundVnd,
    decimal RemainingRefundableVnd,
    string EntitlementStatus,
    DateOnly? StartDate,
    DateOnly? EndDate,
    DateTime? StartAtUtc,
    DateTime? EndAtUtc,
    string? UnitLabel,
    int? TotalUnits,
    int? UsedUnits,
    int? UnusedUnits,
    IReadOnlyList<string> Notes,
    IReadOnlyList<PriorRefundRow> PriorRefunds);

/// <summary>Chính sách áp dụng và số tiền GỢI Ý (không phải quyết định tự động).</summary>
public sealed record RefundPolicySnapshot(
    decimal Percent,
    decimal SuggestedVnd,
    string Basis,
    decimal CenterFaultPercent,
    decimal CenterFaultSuggestedVnd,
    string CenterFaultBasis,
    DateTime EvaluatedAtUtc,
    string Disclaimer);

public sealed record BankRefundSnapshot(RefundServiceSnapshot Service, RefundPolicySnapshot Policy);

public sealed record BankAccountView(string BankName, string AccountNumber, string AccountHolder, bool Masked);

public sealed record BankPayoutView(decimal Amount, DateTime TransferredAt, string? Reference, string Note,
    string? PaidByName, DateTime RecordedAtUtc);

public sealed record BankRefundView(
    Guid BankRefundId,
    Guid SupportRequestId,
    string Status,
    string TicketStatus,
    Guid MemberId,
    string? MemberName,
    BankAccountView Account,
    RefundServiceSnapshot Service,
    RefundPolicySnapshot Policy,
    decimal? ApprovedAmount,
    bool CenterFault,
    string? ApprovalReason,
    DateTime? ApprovedAt,
    string? ApprovedByName,
    BankPayoutView? Payout,
    bool NeedsReconciliation,
    string? ReconciliationNote,
    string? RejectionReason,
    DateTime? RejectedAt,
    DateTime CreatedAt,
    /// <summary>True when the figures come from the stored snapshot (the request is final or the entitlement can no longer be read).</summary>
    bool Frozen);

public sealed record BankRefundListRow(
    Guid BankRefundId,
    Guid SupportRequestId,
    string Status,
    string TicketStatus,
    string? MemberName,
    string ItemType,
    string Description,
    decimal SuggestedAmount,
    decimal? ApprovedAmount,
    decimal? PayoutAmount,
    bool NeedsReconciliation,
    DateTime CreatedAt);

public sealed class ApproveBankRefundRequest
{
    /// <summary>Số tiền VND Manager quyết định hoàn (số nguyên dương, không vượt giá trị thực còn có thể hoàn).</summary>
    [Range(1, 100_000_000_000)]
    public decimal Amount { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    /// <summary>Manager xác nhận lỗi do trung tâm: tính theo phần chưa dùng/100% tương ứng; cần lý do ≥ 10 ký tự.</summary>
    public bool CenterFault { get; set; }
}

public sealed class RejectBankRefundRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

public sealed class FlagBankRefundPayoutRequest
{
    [Required, MinLength(10), MaxLength(500)]
    public string Note { get; set; } = string.Empty;
}

public sealed class CompleteBankRefundRequest
{
    /// <summary>Do client sinh một lần cho mỗi lần mở form; gửi lại cùng khóa (do lỗi mạng) không ghi nhận hai lần.</summary>
    [Required]
    public Guid CompletionKey { get; set; }

    /// <summary>Số tiền thực chuyển; phải bằng số đã duyệt. Khác số duyệt → duyệt lại trước khi ghi nhận.</summary>
    [Range(1, 100_000_000_000)]
    public decimal PayoutAmount { get; set; }

    /// <summary>Thời điểm chuyển khoản (không ở tương lai, không trước thời điểm duyệt).</summary>
    [Required]
    public DateTimeOffset TransferredAt { get; set; }

    [MaxLength(100)]
    public string? BankReference { get; set; }

    /// <summary>Ghi chú nêu rõ lý do hoàn (hiển thị cho Member và Lễ tân).</summary>
    [Required, MinLength(10), MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    /// <summary>1–3 ảnh chứng từ chuyển khoản (JPG/PNG/WebP, ≤5 MB mỗi ảnh).</summary>
    public List<IFormFile>? Files { get; set; }
}
