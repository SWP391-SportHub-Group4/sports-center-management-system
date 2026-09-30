namespace SportHub.Payment.Wallet.Domain;

/// <summary>Immutable wallet history. Deltas explicitly distinguish credit and debit adjustments.</summary>
public sealed class PointLedgerEntry
{
    public Guid LedgerEntryId { get; set; }
    public Guid WalletId { get; set; }
    public Guid? InvoiceItemId { get; set; }
    public PointEntryType EntryType { get; set; }
    public int Points { get; set; }
    public int AvailableDelta { get; set; }
    public int HeldDelta { get; set; }
    public int AvailableAfter { get; set; }
    public int HeldAfter { get; set; }
    public string ReferenceType { get; set; } = string.Empty;
    public Guid ReferenceId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
