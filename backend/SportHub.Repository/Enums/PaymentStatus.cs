namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd PaymentStatus.Pending <-> "PENDING") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trạng thái giao dịch thanh toán. Chỉ Success tính vào tổng đã thu (BR-41).
/// Dùng ở: Payment.Status.
/// </summary>
public enum PaymentStatus
{
    Pending,
    Success,
    Failed
}
