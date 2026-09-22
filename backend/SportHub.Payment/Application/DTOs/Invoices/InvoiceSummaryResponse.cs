namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceSummaryResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    decimal TotalAmount,
    decimal CollectedAmount,
    decimal AdjustmentAmount,
    decimal NetPayable,
    decimal Outstanding,
    decimal RefundedAmount,
    string Status,
    DateTime IssuedAt,
    DateTime DueDateUtc,
    DateTime? FirstDepositAtUtc,
    bool IsOverdue);
