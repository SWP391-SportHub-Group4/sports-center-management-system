using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Từng GIAO DỊCH THU TIỀN thật cho 1 Invoice — tách khỏi Invoice vì có thể trả
// nhiều lần/nhiều phương thức (Invoice bất biến, Payment là các lần thu nối tiếp).
public class Payment
{
    public Guid PaymentId { get; set; }

    public Guid InvoiceId { get; set; }

    public Invoice? Invoice { get; set; }

    // Tổng amount (status SUCCESS) không được vượt Invoice.total_amount (BR-41, ràng buộc #6).
    public decimal Amount { get; set; }

    // CASH/CARD/TRANSFER/EWALLET — MVP chủ yếu ghi nhận thủ công.
    public PaymentMethod Method { get; set; }

    // Nullable — mã tham chiếu từ cổng thanh toán ngoài (nếu có).
    public string? ReferenceCode { get; set; }

    // PENDING/SUCCESS/FAILED — chỉ SUCCESS mới tính vào tổng đã thu.
    public PaymentStatus Status { get; set; }

    // Nhân viên nào nhận tiền — audit, thường Receptionist.
    public Guid ReceivedByUserId { get; set; }

    public UserAccount? ReceivedByUser { get; set; }

    public DateTime PaidAt { get; set; }

    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
