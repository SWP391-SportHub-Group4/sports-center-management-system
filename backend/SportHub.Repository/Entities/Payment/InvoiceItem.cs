using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class InvoiceItem
{
    public Guid ItemId { get; set; } // PK

    public Guid InvoiceId { get; set; } // FK -> Invoice

    public Invoice? Invoice { get; set; }

    public string Description { get; set; } = string.Empty; // diễn giải hiển thị trên hóa đơn

    public decimal Amount { get; set; }

    public InvoiceItemRelatedEntityType RelatedEntityType { get; set; } // Package/ClassFee/Penalty

    public Guid? RelatedEntityId { get; set; } // trỏ tới entity nguồn (vd MemberPackageId), không FK cứng
}
