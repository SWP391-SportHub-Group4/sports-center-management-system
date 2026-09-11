using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Hóa đơn — BẤT BIẾN (BR-40), tạo NGAY khi Member chọn gói/dịch vụ, TRƯỚC khi
// thanh toán (BR-30 v1.2). Không bao giờ bị xóa, chỉ chuyển VOID khi cần hủy
// toàn phần. State machine: SSOT §4 / Design v2 §2.3.
public class Invoice
{
    public Guid InvoiceId { get; set; }

    // Unique, human-readable, sinh từ DB sequence — không random ở app (BR-58, ràng buộc #5).
    public string InvoiceNumber { get; set; } = string.Empty;

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    // Nhân viên nào xuất (thường Receptionist) — audit.
    public Guid IssuedByUserId { get; set; }

    public UserAccount? IssuedByUser { get; set; }

    // Nullable — nếu hóa đơn gắn với 1 gói cụ thể thì trỏ tới đó (nullable vì có
    // thể là phí khác, vd penalty).
    public Guid? MemberPackageId { get; set; }

    public MemberPackage? MemberPackage { get; set; }

    // Tổng tiền phải thu — chuẩn để so sánh với tổng Payment.amount (BR-41).
    public decimal TotalAmount { get; set; }

    // ISSUED -> PARTIALLY_PAID -> PAID, hoặc -> VOID.
    public InvoiceStatus Status { get; set; }

    public DateTime IssuedAt { get; set; }

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
