using SportHub.Identity.Domain.Entities;

namespace SportHub.Payment.Domain.Entities;

public class PaymentAdjustment
{
    public Guid AdjustmentId { get; set; } // PK

    public Guid InvoiceId { get; set; } // FK -> Invoice

    public Invoice? Invoice { get; set; }

    public Guid? PaymentId { get; set; } // FK -> Payment, null nếu không gắn 1 giao dịch cụ thể

    public Payment? Payment { get; set; }

    public PaymentAdjustmentType Type { get; set; } // Refund/Correction/Discount

    /// <summary>Số tiền hiện hành: bằng RequestedAmount cho tới khi Manager ghi đè lúc duyệt.</summary>
    public decimal Amount { get; set; }

    /// <summary>
    /// Số tiền Lễ tân đề nghị ban đầu, bất biến sau khi tạo (BR-42 v1.4 §4.3): Manager cần
    /// thấy được mình đang duyệt lệch bao nhiêu so với đề nghị, và bước complete không được
    /// phép đổi số đã duyệt.
    /// </summary>
    public decimal RequestedAmount { get; set; }

    public string Reason { get; set; } = string.Empty; // bắt buộc để Manager duyệt có căn cứ

    public PaymentAdjustmentStatus Status { get; set; } // Requested/Approved|Rejected/Completed

    public Guid RequestedByUserId { get; set; } // FK -> UserAccount

    public UserAccount? RequestedByUser { get; set; }

    public Guid? ApprovedByUserId { get; set; } // FK -> UserAccount, null nếu chưa duyệt

    public UserAccount? ApprovedByUser { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Thời điểm Manager duyệt (BR-42 v1.4). Với Refund đây KHÔNG phải ngày tiền ra khỏi quầy —
    /// ngày đó là <see cref="CompletedAtUtc"/>, và báo cáo doanh thu phải dùng ngày sau (BR-43).
    /// </summary>
    public DateTime? ApprovedAtUtc { get; set; }

    /// <summary>
    /// Thời điểm khoản điều chỉnh thực sự có hiệu lực tiền tệ:
    /// - Discount/Correction: đặt luôn trong transaction duyệt (không có tiền chuyển đi).
    /// - Refund: chỉ đặt khi Lễ tân xác nhận đã thực trả.
    /// </summary>
    public DateTime? CompletedAtUtc { get; set; }

    /// <summary>Người xác nhận thực trả (Refund) — FK -> UserAccount. Bắt buộc cho Refund Completed.</summary>
    public Guid? CompletedByUserId { get; set; }

    public UserAccount? CompletedByUser { get; set; }

    /// <summary>Phương thức thực trả — chỉ có nghĩa với Refund đã Completed.</summary>
    public PaymentMethod? RefundMethod { get; set; }

    /// <summary>
    /// Mã tham chiếu chứng minh đã trả. Bắt buộc với chuyển khoản/thẻ/ví (BR-42 v1.4);
    /// tiền mặt dựa vào actor + thời điểm + Audit tại quầy.
    /// </summary>
    public string? RefundReferenceCode { get; set; }

    /// <summary>
    /// Bản ghi có TRƯỚC khi tách approve/complete (migration AddRefundPayoutEvidence): được đánh
    /// dấu Completed bởi bước duyệt tự động cũ, nên KHÔNG có bằng chứng ai trả, trả lúc nào,
    /// trả bằng gì.
    ///
    /// Không backfill bằng suy đoán (SSOT §5.7). Cách xử lý:
    /// - VẪN tính vào RefundedAmount: giả định thận trọng là tiền ĐÃ ra khỏi quầy, để không ai
    ///   hoàn lần thứ hai cho cùng một khoản.
    /// - KHÔNG tính vào báo cáo thu ròng theo kỳ (BR-43): không có ngày thực trả đáng tin để
    ///   quy kỳ, và gán bừa ngày duyệt chính là lỗi mà v1.4 sửa.
    /// - Xuất ra danh sách đối soát để người vận hành xác minh với sổ quỹ.
    ///
    /// Đường ghi mới KHÔNG BAO GIỜ đặt cờ này; mọi Refund mới phải có bằng chứng thật.
    /// </summary>
    public bool LegacyPayoutUnverified { get; set; }

    /// <summary>
    /// Giữ cho tương thích dữ liệu cũ (SSOT §5.7). KHÔNG dùng thay ngày thực trả trong bất kỳ
    /// phép tính tiền nào — bản ghi legacy chỉ chứng minh "đã được duyệt", không chứng minh
    /// "đã trả". Đường ghi mới vẫn set để không làm gãy màn hình/query cũ đọc field này.
    /// </summary>
    public DateTime? ResolvedAt { get; set; }
}
