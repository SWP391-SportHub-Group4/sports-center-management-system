namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceItemResponse(
    Guid ItemId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ItemType,
    string Description,
    decimal UnitPrice,
    int Quantity,
    decimal LineAmount,
    Guid? RelatedEntityId,
    int? ClassId = null, Guid? CourtRentalId = null, Guid? PtEntitlementId = null,
    Guid? MemberPackageId = null, int? SportId = null, string? SportName = null,
    int? PtFrequencyPerWeek = null, Guid? SourceInvoiceItemId = null);
