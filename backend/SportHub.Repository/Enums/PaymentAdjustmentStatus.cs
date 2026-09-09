namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd PaymentAdjustmentStatus.Requested <-> "REQUESTED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Vòng đời yêu cầu điều chỉnh thanh toán — Manager duyệt, không tự duyệt (BR-42). State machine: SSOT §4 / Design v2 §2.4.
/// Dùng ở: PaymentAdjustment.Status.
/// </summary>
public enum PaymentAdjustmentStatus
{
    Requested,
    Approved,
    Rejected,
    Completed
}
