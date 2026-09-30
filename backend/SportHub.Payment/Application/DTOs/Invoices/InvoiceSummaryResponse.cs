namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceSummaryResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    decimal TotalAmount,
    decimal GrossCollected,
    decimal ObligationReduction,
    decimal RefundedAmount,
    decimal NetCollected,
    decimal NetPayable,
    decimal Outstanding,
    decimal RefundDue,
    string Status,
    DateTime IssuedAt,
    int PointsSpent = 0,
    decimal CashAmount = 0,
    string? PaidVia = null,
    DateTime? PaidAtUtc = null,
    DateTime? CheckoutExpiresAtUtc = null,
    bool ReconciliationRequired = false);
