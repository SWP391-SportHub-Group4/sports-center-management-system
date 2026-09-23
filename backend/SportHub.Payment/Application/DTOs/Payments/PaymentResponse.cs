namespace SportHub.Payment.Application.DTOs;

public sealed record PaymentResponse(
    Guid PaymentId,
    decimal Amount,
    string Method,
    string Status,
    string? ReferenceCode,
    Guid ReceivedByUserId,
    string ReceivedByName,
    DateTime PaidAt);
