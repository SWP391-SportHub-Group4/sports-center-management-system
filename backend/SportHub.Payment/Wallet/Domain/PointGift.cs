namespace SportHub.Payment.Wallet.Domain;

/// <summary>A Manager-confirmed gift, committed with its wallet entry and notifications.</summary>
public sealed class PointGift
{
    public Guid GiftId { get; set; }
    public Guid BatchId { get; set; }
    public Guid MemberId { get; set; }
    public Guid ManagerId { get; set; }
    public Guid? IncidentId { get; set; }
    public int Points { get; set; }
    public string Reason { get; set; } = string.Empty;
    public bool MemberAgreed { get; set; }
    public Guid LedgerEntryId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
