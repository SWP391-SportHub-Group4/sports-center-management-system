namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceDetailResponse(
    InvoiceSummaryResponse Summary,
    Guid? MemberPackageId,
    IReadOnlyList<InvoiceItemResponse> Items,
    IReadOnlyList<PaymentResponse> Payments,
    IReadOnlyList<PaymentAdjustmentResponse> Adjustments,
    /// <summary>Deprecated legacy field; always zero. Item-scoped refunds return points from /api/refunds.</summary>
    decimal SuggestedRefundAmount);
