using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Điều chỉnh sau khi đã có Invoice/Payment — hoàn tiền, sửa sai, chiết khấu — có
// workflow duyệt riêng (không ai tự ý sửa hóa đơn/thanh toán gốc, giữ đúng
// nguyên tắc Invoice bất biến). State machine: SSOT §4 / Design v2 §2.4.
public class PaymentAdjustment
{
    public Guid AdjustmentId { get; set; }

    public Guid InvoiceId { get; set; }

    public Invoice? Invoice { get; set; }

    // Nullable — nếu liên quan 1 giao dịch thu tiền cụ thể thì trỏ tới đó.
    public Guid? PaymentId { get; set; }

    public Payment? Payment { get; set; }

    // REFUND/CORRECTION/DISCOUNT — loại điều chỉnh, quyết định công thức tính (BR-52 cho REFUND).
    public PaymentAdjustmentType Type { get; set; }

    public decimal Amount { get; set; }

    // Lý do — bắt buộc để Manager duyệt có căn cứ.
    public string Reason { get; set; } = string.Empty;

    // REQUESTED -> APPROVED/REJECTED -> COMPLETED — Receptionist tạo, Manager phải
    // duyệt, không được tự duyệt (BR-42).
    public PaymentAdjustmentStatus Status { get; set; }

    public Guid RequestedByUserId { get; set; }

    public UserAccount? RequestedByUser { get; set; }

    // Nullable — null nếu chưa duyệt/bị từ chối.
    public Guid? ApprovedByUserId { get; set; }

    public UserAccount? ApprovedByUser { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ResolvedAt { get; set; }
}
