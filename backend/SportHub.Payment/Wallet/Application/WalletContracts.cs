using System.ComponentModel.DataAnnotations;
using SportHub.BuildingBlocks.Abstractions.Wallet;

namespace SportHub.Payment.Wallet.Application;

public sealed record WalletBalanceResponse(Guid OwnerUserId, int AvailablePoints, int HeldPoints, int VndPerPoint);
public sealed record WalletLedgerResponse(Guid Id, string EntryType, int Points, int AvailableDelta, int HeldDelta,
    int AvailableAfter, int HeldAfter, string ReferenceType, Guid ReferenceId, string? Note, DateTime CreatedAtUtc);
public sealed record PointConfirmationResponse(Guid ConfirmationId, Guid InvoiceId, Guid MemberId, int Points,
    DateTime ExpiresAtUtc, DateTime HoldExpiresAtUtc, string Status, int Revision);
public sealed record PointSelectionResponse(Guid InvoiceId, Guid MemberId, int PointsApplied, decimal CashAmount,
    DateTime? HoldExpiresAtUtc, string Status, int Revision);
public sealed class RequestPointConfirmationRequest
{
    public Guid MemberId { get; set; }
    [Range(1, int.MaxValue)] public int Revision { get; set; }
    [Range(1, int.MaxValue)] public int Points { get; set; }
}
public sealed class VerifyPointConfirmationRequest
{
    [Required, RegularExpression("^[0-9]{6}$")] public string Code { get; set; } = string.Empty;
}
public sealed class ClearCounterPointsRequest
{
    public Guid MemberId { get; set; }
    [Range(1, int.MaxValue)] public int Revision { get; set; }
}
public sealed class SelectSelfPointsRequest
{
    [Range(0, int.MaxValue)] public int Points { get; set; }
}
public sealed class AdjustPointsRequest
{
    public Guid IdempotencyKey { get; set; }
    [Range(1, int.MaxValue)] public int Points { get; set; }
    public WalletAdjustmentDirection Direction { get; set; }
    [Required, MaxLength(1000)] public string Reason { get; set; } = string.Empty;
}
