namespace SportHub.Payment.Application.DTOs.Checkouts;

public sealed record CheckoutResponse(Guid InvoiceId, Guid CheckoutSessionId, int Revision,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Kind, [property: SportHub.BuildingBlocks.Api.WireEnum] string State, decimal TotalAmount, int PointsApplied, decimal CashAmount,
    DateTime ExpiresAtUtc, Guid? ResourceHoldId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string InvoiceStatus = "Issued",
    [property: SportHub.BuildingBlocks.Api.WireEnum] string FulfillmentOutcome = "Pending",
    bool ReconciliationRequired = false);

public sealed record PaymentAttemptResponse(Guid PaymentAttemptId, Guid InvoiceId,
    string TransactionReference, decimal CashAmount, int PointsApplied,
    DateTime ExpiresAtUtc, string? PaymentUrl, [property: SportHub.BuildingBlocks.Api.WireEnum] string State);
