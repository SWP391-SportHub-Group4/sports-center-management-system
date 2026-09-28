using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Domain.Entities;

public class InvoiceItem
{
    public Guid ItemId { get; set; }

    public Guid InvoiceId { get; set; }

    public Invoice? Invoice { get; set; }

    public InvoiceItemType ItemType { get; set; }

    public string Description { get; set; } = string.Empty;

    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    public decimal LineAmount { get; set; }

    public Guid? RelatedEntityId { get; set; }
}
