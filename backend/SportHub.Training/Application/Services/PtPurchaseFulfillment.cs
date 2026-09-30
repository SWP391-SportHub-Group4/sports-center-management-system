using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Application.Services;

public sealed class PtPurchaseFulfillment(PtPricingService pricing, IPtEntitlementLifecycle lifecycle,
    ISportHubDbContext db) : IPtPurchaseFulfillment
{
    public async Task<PtPurchaseQuote> QuoteAsync(PtPurchaseRequest request, CancellationToken cancellationToken = default)
    {
        var quote = await pricing.QuoteAsync(request, cancellationToken);
        return new PtPurchaseQuote(quote.PricePerSession, quote.TotalQuota, quote.TotalPrice,
            quote.FrequencyPerWeek, quote.PriceVersion);
    }

    public Task<Guid> CreatePendingAsync(PtPurchaseRequest request, Guid invoiceItemId,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        return lifecycle.CreatePendingAsync(new CreatePendingPtEntitlementCommand(
            request.MemberId, request.CoachId, request.MemberPackageId, request.FrequencyPerWeek),
            cancellationToken);
    }

    public Task ActivateAsync(Guid ptEntitlementId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        return lifecycle.ActivateAsync(ptEntitlementId, ptEntitlementId, cancellationToken);
    }

    public Task CancelAsync(Guid ptEntitlementId, string reason, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        return lifecycle.CancelAsync(ptEntitlementId, reason, cancellationToken);
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("PT purchase fulfillment requires the caller's transaction.");
    }
}
