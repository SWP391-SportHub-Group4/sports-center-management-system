namespace SportHub.Payment.Application.DTOs;

public sealed record PaymentAdjustmentResponse(
    Guid AdjustmentId,
    Guid InvoiceId,
    string InvoiceNumber,
    Guid? PaymentId,
    string Type,
    decimal Amount,
    string Reason,
    string Status,
    Guid RequestedByUserId,
    string RequestedByName,
    Guid? ApprovedByUserId,
    string? ApprovedByName,
    DateTime CreatedAt,
    DateTime? ResolvedAt);
