namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd PaymentAdjustmentType.Refund <-> "REFUND") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Loại điều chỉnh thanh toán.
/// Dùng ở: PaymentAdjustment.Type.
/// </summary>
public enum PaymentAdjustmentType
{
    Refund,
    Correction,
    Discount
}
