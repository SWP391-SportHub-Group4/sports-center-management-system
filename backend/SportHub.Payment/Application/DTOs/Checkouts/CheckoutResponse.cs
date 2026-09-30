namespace SportHub.Payment.Application.DTOs.Checkouts;

public sealed record CheckoutResponse(Guid InvoiceId, Guid CheckoutSessionId, int Revision,
    string Kind, string State, decimal TotalAmount, int PointsApplied, decimal CashAmount,
    DateTime ExpiresAtUtc, Guid? ResourceHoldId);

public sealed record PaymentAttemptResponse(Guid PaymentAttemptId, Guid InvoiceId,
    string TransactionReference, decimal CashAmount, int PointsApplied,
    DateTime ExpiresAtUtc, string? PaymentUrl, string State);
