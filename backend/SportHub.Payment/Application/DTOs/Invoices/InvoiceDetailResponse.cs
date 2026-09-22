namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceDetailResponse(
    InvoiceSummaryResponse Summary,
    Guid? MemberPackageId,
    IReadOnlyList<InvoiceItemResponse> Items,
    IReadOnlyList<PaymentResponse> Payments,
    IReadOnlyList<PaymentAdjustmentResponse> Adjustments,
    decimal SuggestedRefundAmount);
