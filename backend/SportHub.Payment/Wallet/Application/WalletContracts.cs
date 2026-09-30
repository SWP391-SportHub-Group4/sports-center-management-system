using System.ComponentModel.DataAnnotations;
using SportHub.BuildingBlocks.Abstractions.Wallet;

namespace SportHub.Payment.Wallet.Application;

public sealed record WalletBalanceResponse(Guid OwnerUserId, int AvailablePoints, int HeldPoints, int VndPerPoint);
public sealed record WalletLedgerResponse(Guid Id, string EntryType, int Points, int AvailableDelta, int HeldDelta,
    int AvailableAfter, int HeldAfter, string ReferenceType, Guid ReferenceId, string? Note, DateTime CreatedAtUtc);
public sealed class AdjustPointsRequest
{
    public Guid IdempotencyKey { get; set; }
    [Range(1, int.MaxValue)] public int Points { get; set; }
    public WalletAdjustmentDirection Direction { get; set; }
    [Required, MaxLength(1000)] public string Reason { get; set; } = string.Empty;
}
