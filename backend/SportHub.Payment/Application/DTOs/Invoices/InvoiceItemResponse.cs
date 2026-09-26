namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceItemResponse(
    Guid ItemId,
    string ItemType,
    string Description,
    decimal UnitPrice,
    int Quantity,
    decimal LineAmount,
    Guid? RelatedEntityId);
