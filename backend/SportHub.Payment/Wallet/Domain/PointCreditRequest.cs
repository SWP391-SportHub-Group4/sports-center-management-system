namespace SportHub.Payment.Wallet.Domain;

public enum PointCreditRequestStatus { Pending, Approved, Rejected }

/// <summary>A manual credit must be approved by a different active Manager before it reaches the wallet.</summary>
public sealed class PointCreditRequest
{
    public Guid RequestId { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public int Points { get; set; }
    public string Reason { get; set; } = string.Empty;
    public PointCreditRequestStatus Status { get; set; }
    public DateTime RequestedAtUtc { get; set; }
    public Guid? DecidedByUserId { get; set; }
    public DateTime? DecidedAtUtc { get; set; }
    public string? DecisionReason { get; set; }
    public Guid? LedgerEntryId { get; set; }
}
