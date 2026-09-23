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
    IReadOnlyList<RevenueReportRowResponse> Daily);
