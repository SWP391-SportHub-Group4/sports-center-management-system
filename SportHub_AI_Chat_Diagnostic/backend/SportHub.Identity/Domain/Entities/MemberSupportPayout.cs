namespace SportHub.Identity.Domain.Entities;

public sealed class MemberSupportPayout
{
    public Guid PayoutId { get; set; }
    public Guid RequestId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid? InvoiceItemId { get; set; }
    public int PointsRefunded { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; }
    public DateTime? MemberConfirmedAtUtc { get; set; }
    public string? MemberConfirmedBy { get; set; }
}
