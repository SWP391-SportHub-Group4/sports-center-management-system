namespace SportHub.Payment.Application.DTOs;

public sealed record RevenueReportRowResponse(
    DateOnly Date,
    decimal Collected,
    decimal Refunded,
    decimal ObligationReduction,
    decimal Net)
{
    public decimal ReconciliationCashCollected { get; init; }
    public decimal LegacyCashCollected { get; init; }
    /// <summary>Compatibility alias of Refunded, not an additional payout amount.</summary>
    public decimal BankRefundPaid { get; init; }
    public long PointsRedeemed { get; init; }
    public long PointsIssued { get; init; }
    public long PointsRefunded { get; init; }
    public long ManagerPointAdjustment { get; init; }
}
