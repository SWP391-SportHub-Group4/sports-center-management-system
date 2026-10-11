namespace SportHub.Payment.Wallet.Domain;

public sealed class PointConfirmation
{
    public Guid PointConfirmationId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid MemberId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public Guid CheckoutCycleId { get; set; }
    public int CheckoutRevision { get; set; }
    public int Points { get; set; }
    public string CodeHash { get; set; } = string.Empty;
    public string CodeSalt { get; set; } = string.Empty;
    public int FailedAttempts { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
