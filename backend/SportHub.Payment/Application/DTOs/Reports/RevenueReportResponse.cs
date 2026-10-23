namespace SportHub.Payment.Application.DTOs;

/// <summary>
/// BR-43 v1.4 — thu ròng chỉ gồm tiền thật: thu trừ hoàn đã thực trả.
/// Giảm nghĩa vụ (Discount/Correction) là cột thông tin riêng, KHÔNG trừ vào NetRevenue.
/// </summary>
public sealed record RevenueReportResponse(
    DateOnly FromDate,
    DateOnly ToDate,
    decimal TotalCollected,
    /// <summary>Refund Completed theo ngày THỰC TRẢ trong kỳ.</summary>
    decimal TotalRefunded,
    /// <summary>Discount/Correction Completed trong kỳ — hiển thị riêng để đối soát.</summary>
    decimal TotalObligationReduction,
    /// <summary>TotalCollected − TotalRefunded.</summary>
    decimal NetRevenue,
    int InvoiceCount,
    int PaymentCount,
    int RefundCount,
    IReadOnlyList<RevenueReportRowResponse> Daily)
{
    /// <summary>Collected through non-VNPay legacy/manual payment methods; shown separately from VNPay.</summary>
    public decimal LegacyCashCollected { get; init; }

    /// <summary>Verified gateway cash routed to reconciliation/point compensation, using provider pay date.</summary>
    public decimal ReconciliationCashCollected { get; init; }
    public int ReconciliationCashCount { get; init; }

    /// <summary>Points spent during the period.</summary>
    public long PointsRedeemed { get; init; }

    /// <summary>VND equivalent at the fixed business rate of 1,000 VND per point.</summary>
    public decimal PointsRedeemedVnd => PointsRedeemed * 1_000m;

    /// <summary>Points credited to wallets during the period, including refund/compensation credits.</summary>
    public long PointsIssued { get; init; }

    /// <summary>
    /// Points returned to members as refunds in the period (member/manager refunds, center-fault cancellations,
    /// class-transfer differences). A subset of <see cref="PointsIssued"/>; excludes gateway compensation.
    /// Points are not cash, so this is never subtracted from <see cref="NetRevenue"/>.
    /// </summary>
    public long PointsRefunded { get; init; }

    /// <summary>
    /// Cash refunded to members' bank accounts through the Support Request workflow, by transfer date. Already included in
    /// <see cref="TotalRefunded"/> and <see cref="RefundCount"/>; separate from <see cref="PointsRefunded"/>.
    /// </summary>
    public decimal BankRefundAmount { get; init; }
    public int BankRefundCount { get; init; }

    /// <summary>Net points changed by explicit Manager adjustments during the period.</summary>
    public long ManagerPointAdjustment { get; init; }

    /// <summary>Current available + held points, regardless of holds.</summary>
    public long OutstandingPoints { get; init; }
    /// <summary>UTC observation time of the current wallet balance; not the selected period end.</summary>
    public DateTime OutstandingPointsAsOfUtc { get; init; }

    public IReadOnlyList<RevenueReportSourceRowResponse> BySource { get; init; } = [];
    public IReadOnlyList<RevenueReportDimensionRowResponse> BySportAndSource { get; init; } = [];
}

public sealed record RevenueReportDimensionRowResponse(
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Source, int? SportId, string? SportName, Guid? MemberId,
    decimal CashCollected, decimal LegacyCashCollected, long PointsRedeemed);

public sealed record RevenueReportSourceRowResponse(
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Source,
    decimal CashCollected,
    long PointsRedeemed);
