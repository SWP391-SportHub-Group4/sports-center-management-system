using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Điều chỉnh sau khi đã có Invoice/Payment — hoàn tiền, sửa sai, chiết khấu — có
// workflow duyệt riêng (không ai tự ý sửa hóa đơn/thanh toán gốc, giữ đúng
// nguyên tắc Invoice bất biến). State machine: SSOT §4 / Design v2 §2.4.
public class PaymentAdjustment
{
    public Guid adjustment_id { get; set; }

    public Guid invoice_id { get; set; }

    public Invoice? Invoice { get; set; }

    // Nullable — nếu liên quan 1 giao dịch thu tiền cụ thể thì trỏ tới đó.
    public Guid? payment_id { get; set; }

    public Payment? Payment { get; set; }

    // REFUND/CORRECTION/DISCOUNT — loại điều chỉnh, quyết định công thức tính (BR-52 cho REFUND).
    public PaymentAdjustmentType type { get; set; }

    public decimal amount { get; set; }

    // Lý do — bắt buộc để Manager duyệt có căn cứ.
    public string reason { get; set; } = string.Empty;

    // REQUESTED -> APPROVED/REJECTED -> COMPLETED — Receptionist tạo, Manager phải
    // duyệt, không được tự duyệt (BR-42).
    public PaymentAdjustmentStatus status { get; set; }

    public Guid requested_by_user_id { get; set; }

    public UserAccount? RequestedByUser { get; set; }

    // Nullable — null nếu chưa duyệt/bị từ chối.
    public Guid? approved_by_user_id { get; set; }

    public UserAccount? ApprovedByUser { get; set; }

    public DateTime created_at { get; set; }

    public DateTime? resolved_at { get; set; }
}
