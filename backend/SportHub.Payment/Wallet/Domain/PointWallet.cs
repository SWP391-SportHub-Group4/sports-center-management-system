namespace SportHub.Payment.Wallet.Domain;

public sealed class PointWallet
{
    public Guid WalletId { get; set; }
    public Guid OwnerUserId { get; set; }
    public int AvailablePoints { get; set; }
    public int HeldPoints { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
