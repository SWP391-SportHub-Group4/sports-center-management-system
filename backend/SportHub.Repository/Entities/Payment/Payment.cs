using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Từng GIAO DỊCH THU TIỀN thật cho 1 Invoice — tách khỏi Invoice vì có thể trả
// nhiều lần/nhiều phương thức (Invoice bất biến, Payment là các lần thu nối tiếp).
public class Payment
{
    public Guid payment_id { get; set; }

    public Guid invoice_id { get; set; }

    public Invoice? Invoice { get; set; }

    // Tổng amount (status SUCCESS) không được vượt Invoice.total_amount (BR-41, ràng buộc #6).
    public decimal amount { get; set; }

    // CASH/CARD/TRANSFER/EWALLET — MVP chủ yếu ghi nhận thủ công.
    public PaymentMethod method { get; set; }

    // Nullable — mã tham chiếu từ cổng thanh toán ngoài (nếu có).
    public string? reference_code { get; set; }

    // PENDING/SUCCESS/FAILED — chỉ SUCCESS mới tính vào tổng đã thu.
    public PaymentStatus status { get; set; }

    // Nhân viên nào nhận tiền — audit, thường Receptionist.
    public Guid received_by_user_id { get; set; }

    public UserAccount? ReceivedByUser { get; set; }

    public DateTime paid_at { get; set; }

    public ICollection<PaymentAdjustment> Adjustments { get; set; } = new List<PaymentAdjustment>();
}
