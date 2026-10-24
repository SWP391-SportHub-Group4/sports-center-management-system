namespace SportHub.Identity.Domain.Entities;

public sealed class MemberSupportPayoutDetail
{
    public Guid RequestId { get; set; }
    public string? BankName { get; set; }
    public string? AccountNumberEncrypted { get; set; }
    public string? AccountLast4 { get; set; }
    public string? AccountHolder { get; set; }
    public DateTime? PurgedAtUtc { get; set; }
}
