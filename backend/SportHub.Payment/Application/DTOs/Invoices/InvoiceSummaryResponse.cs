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
    DateTime IssuedAt);
