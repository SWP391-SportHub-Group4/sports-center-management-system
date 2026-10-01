namespace SportHub.Payment.Application.DTOs;

public sealed record PaymentResponse(
    Guid PaymentId,
    decimal Amount,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Method,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    string? ReferenceCode,
    Guid ReceivedByUserId,
    string ReceivedByName,
    DateTime PaidAt);
