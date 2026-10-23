namespace SportHub.Payment.BankRefunds;

/// <summary>
/// Yêu cầu hoàn tiền về tài khoản ngân hàng, gắn 1-1 với một Support Request PAYMENT và trỏ tới đúng một InvoiceItem.
/// Hệ thống KHÔNG chuyển tiền: Manager duyệt (đặt trần, khóa quyền lợi), chuyển khoản ngoài hệ thống rồi ghi nhận
/// chứng từ để chuyển sang <see cref="BankRefundStatuses.Paid"/>. Báo cáo chỉ tính khoản đã Paid, theo ngày thực chuyển.
/// </summary>
public sealed class BankRefundRequest
{
    public Guid BankRefundId { get; set; }

    /// <summary>MemberSupportRequest.RequestId (unique). Trạng thái của ticket được Payment cập nhật cùng transaction.</summary>
    public Guid SupportRequestId { get; set; }

    public Guid MemberId { get; set; }

    public Guid InvoiceId { get; set; }

    public Guid InvoiceItemId { get; set; }

    /// <summary>Membership, ClassPackage hoặc Rental (InvoiceItemType lúc yêu cầu).</summary>
    public string ItemType { get; set; } = string.Empty;

    public string Status { get; set; } = BankRefundStatuses.Pending;

    public string BankName { get; set; } = string.Empty;

    public string AccountNumber { get; set; } = string.Empty;

    public string AccountHolder { get; set; } = string.Empty;

    public Guid RequestedByUserId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Số tiền gợi ý (VND) theo chính sách tại thời điểm gửi yêu cầu; chỉ để tham khảo, không phải quyết định.</summary>
    public decimal SuggestedAmount { get; set; }

    /// <summary>Tỷ lệ chính sách (0–100) tương ứng số gợi ý.</summary>
    public decimal PolicyPercent { get; set; }

    /// <summary>Snapshot dịch vụ/giao dịch lúc gửi yêu cầu (JSON) — bất biến.</summary>
    public string RequestSnapshotJson { get; set; } = "{}";

    // Duyệt
    public decimal? ApprovedAmount { get; set; }
    public bool CenterFault { get; set; }
    public string? ApprovalReason { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public string? ApprovalSnapshotJson { get; set; }

    // Chuyển khoản (ngoài hệ thống) đã ghi nhận
    public decimal? PayoutAmount { get; set; }
    public DateTime? PayoutAt { get; set; }
    public string? PayoutReference { get; set; }
    public string? PayoutNote { get; set; }
    public Guid? PaidByUserId { get; set; }
    public DateTime? PaidRecordedAtUtc { get; set; }

    /// <summary>Khóa idempotency do client sinh cho lần ghi nhận; gửi lại cùng khóa trả kết quả cũ, không ghi đôi.</summary>
    public Guid? CompletionKey { get; set; }

    /// <summary>Manager báo đã chuyển tiền nhưng chưa ghi nhận được chứng từ — chờ đối soát thủ công, tuyệt đối không chuyển lại.</summary>
    public bool NeedsReconciliation { get; set; }
    public string? ReconciliationNote { get; set; }
    public DateTime? ReconciliationFlaggedAtUtc { get; set; }

    // Từ chối
    public string? RejectionReason { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTime? RejectedAtUtc { get; set; }
}

public static class BankRefundStatuses
{
    public const string Pending = "PENDING";
    public const string ApprovedAwaitingPayout = "APPROVED_AWAITING_PAYOUT";
    public const string Paid = "PAID";
    public const string Rejected = "REJECTED";

    /// <summary>Trạng thái giữ chỗ cho item: chặn yêu cầu hoàn tiền thứ hai trên cùng item.</summary>
    public static readonly string[] Active = [Pending, ApprovedAwaitingPayout];

    /// <summary>Trạng thái đã cam kết giá trị: trừ vào trần hoàn của item (duyệt chờ chuyển + đã chuyển).</summary>
    public static readonly string[] Committed = [ApprovedAwaitingPayout, Paid];
}
