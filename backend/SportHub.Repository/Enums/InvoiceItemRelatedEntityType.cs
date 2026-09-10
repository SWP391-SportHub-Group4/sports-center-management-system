namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd InvoiceItemRelatedEntityType.Package <-> "PACKAGE") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Loại đối tượng mà 1 dòng hóa đơn tham chiếu tới.
/// Dùng ở: InvoiceItem.related_entity_type.
/// </summary>
public enum InvoiceItemRelatedEntityType
{
    Package,
    ClassFee,
    Penalty
}
