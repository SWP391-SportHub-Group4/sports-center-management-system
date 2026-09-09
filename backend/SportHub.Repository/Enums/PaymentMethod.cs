namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd PaymentMethod.Cash <-> "CASH") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Phương thức thanh toán. MVP ghi nhận thủ công, không qua cổng thanh toán thật (SSOT §1.3).
/// Dùng ở: Payment.Method.
/// </summary>
public enum PaymentMethod
{
    Cash,
    Card,
    Transfer,
    EWallet
}
