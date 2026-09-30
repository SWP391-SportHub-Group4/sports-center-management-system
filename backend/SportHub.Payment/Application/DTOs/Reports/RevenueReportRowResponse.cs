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
}
