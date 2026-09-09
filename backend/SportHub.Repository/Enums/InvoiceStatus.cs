namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd InvoiceStatus.Issued <-> "ISSUED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Vòng đời hóa đơn. State machine: SSOT §4 / Design v2 §2.3.
/// Dùng ở: Invoice.Status.
/// </summary>
public enum InvoiceStatus
{
    Issued,
    PartiallyPaid,
    Paid,
    Void
}
