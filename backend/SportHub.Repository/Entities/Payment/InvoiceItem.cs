using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Dòng chi tiết trong hóa đơn — 1 Invoice có thể có nhiều dòng (vd: tiền gói +
// phí phạt trong cùng 1 hóa đơn).
public class InvoiceItem
{
    public Guid ItemId { get; set; }

    public Guid InvoiceId { get; set; }

    public Invoice? Invoice { get; set; }

    // Diễn giải hiển thị trên hóa đơn.
    public string Description { get; set; } = string.Empty;

    // Số tiền của dòng này — tổng các dòng phải khớp Invoice.total_amount.
    public decimal Amount { get; set; }

    // PACKAGE/CLASS_FEE/PENALTY — dòng này phát sinh từ nguồn nào.
    public InvoiceItemRelatedEntityType RelatedEntityType { get; set; }

    // Nullable — trỏ tới entity nguồn cụ thể (vd member_package_id) để truy vết.
    // Không khai FK/navigation cứng vì entity đích thay đổi tùy related_entity_type.
    public Guid? RelatedEntityId { get; set; }
}
