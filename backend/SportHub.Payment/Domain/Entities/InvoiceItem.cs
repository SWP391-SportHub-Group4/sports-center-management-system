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
    public Guid? SourceInvoiceItemId { get; set; }
    public int? ClassId { get; set; }
    public Guid? CourtRentalId { get; set; }
    public Guid? PtEntitlementId { get; set; }
    public Guid? MemberPackageId { get; set; }
    public int? SportId { get; set; }
    public string? SportNameSnapshot { get; set; }
    public int? PtFrequencyPerWeek { get; set; }
}
