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

    /// <summary>Net points changed by explicit Manager adjustments during the period.</summary>
    public long ManagerPointAdjustment { get; init; }

    /// <summary>Current available + held points, regardless of holds.</summary>
    public long OutstandingPoints { get; init; }

    public IReadOnlyList<RevenueReportSourceRowResponse> BySource { get; init; } = [];
}

public sealed record RevenueReportSourceRowResponse(
    string Source,
    decimal CashCollected,
    long PointsRedeemed);
