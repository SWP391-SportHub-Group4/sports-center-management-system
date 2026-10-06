namespace SportHub.Payment.Application.DTOs;

public sealed record InvoiceSummaryResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid BeneficiaryUserId,
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
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime IssuedAt,
    int PointsSpent = 0,
    decimal CashAmount = 0,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? PaidVia = null,
    DateTime? PaidAtUtc = null,
    DateTime? CheckoutExpiresAtUtc = null,
    bool ReconciliationRequired = false)
{
    /// <summary>Compatibility alias; beneficiary is the Member.</summary>
    public Guid MemberId => BeneficiaryUserId;
    [SportHub.BuildingBlocks.Api.WireEnum]
    public string FulfillmentOutcome => SportHub.BuildingBlocks.Api.WireEnum.TryParse<Domain.Enums.InvoiceStatus>(Status, true, out var status)
        ? Domain.Rules.InvoiceFulfillment.Outcome(status, PaidVia, ReconciliationRequired) : "Pending";
}
