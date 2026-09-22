namespace SportHub.Payment.Application.DTOs;

public sealed record RevenueReportResponse(
    DateOnly FromDate,
    DateOnly ToDate,
    decimal TotalCollected,
    decimal TotalAdjusted,
    decimal NetRevenue,
    int InvoiceCount,
    int PaymentCount,
    IReadOnlyList<RevenueReportRowResponse> Daily);
