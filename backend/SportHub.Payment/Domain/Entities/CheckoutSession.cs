namespace SportHub.Payment.Domain.Entities;

public sealed class CheckoutSession
{
    public Guid CheckoutSessionId { get; set; }
    public Guid InvoiceId { get; set; }
    public int Revision { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string State { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public Guid? ResourceHoldId { get; set; }
    public int? ClassId { get; set; }
    public Guid? PtMemberPackageId { get; set; }
    public Guid? PtCoachId { get; set; }
    public int? PtFrequency { get; set; }
}
