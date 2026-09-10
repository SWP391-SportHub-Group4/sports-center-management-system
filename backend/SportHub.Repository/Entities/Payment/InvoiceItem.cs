using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Payment.
// Dòng chi tiết trong hóa đơn — 1 Invoice có thể có nhiều dòng (vd: tiền gói +
// phí phạt trong cùng 1 hóa đơn).
public class InvoiceItem
{
    public Guid item_id { get; set; }

    public Guid invoice_id { get; set; }

    public Invoice? Invoice { get; set; }

    // Diễn giải hiển thị trên hóa đơn.
    public string description { get; set; } = string.Empty;

    // Số tiền của dòng này — tổng các dòng phải khớp Invoice.total_amount.
    public decimal amount { get; set; }

    // PACKAGE/CLASS_FEE/PENALTY — dòng này phát sinh từ nguồn nào.
    public InvoiceItemRelatedEntityType related_entity_type { get; set; }

    // Nullable — trỏ tới entity nguồn cụ thể (vd member_package_id) để truy vết.
    // Không khai FK/navigation cứng vì entity đích thay đổi tùy related_entity_type.
    public Guid? related_entity_id { get; set; }
}
