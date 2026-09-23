namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceItemResponse(Guid ItemId, string Description, decimal Amount, string RelatedEntityType);
