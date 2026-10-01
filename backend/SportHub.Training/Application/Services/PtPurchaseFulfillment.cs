using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using Microsoft.EntityFrameworkCore;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Domain.Entities;

namespace SportHub.Training.Application.Services;

public sealed class PtPurchaseFulfillment(PtPricingService pricing, IPtEntitlementLifecycle lifecycle,
    ISportHubDbContext db, PtSessionService sessions,
    SportHub.BuildingBlocks.Abstractions.Identity.ICoachSpecialtyReader specialties,
    SportHub.BuildingBlocks.Abstractions.Scheduling.ISportCatalogReader catalog) : IPtPurchaseFulfillment
{
    public async Task<PtPurchaseQuote> QuoteAsync(PtPurchaseRequest request, CancellationToken cancellationToken = default)
    {
        var quote = await pricing.QuoteAsync(request, cancellationToken);
        var sports = new List<SportHub.BuildingBlocks.Abstractions.Scheduling.SportInfo>();
        foreach (var id in await specialties.GetSportIdsAsync(request.CoachId, cancellationToken))
        {
            var sport = await catalog.GetSportAsync(id, cancellationToken);
            if (sport is { IsActive: true, OperationType: "OneOnOne" }) sports.Add(sport);
        }
        var selected = sports.Count == 1 ? sports[0] : null;
        return new PtPurchaseQuote(quote.PricePerSession, quote.TotalQuota, quote.TotalPrice,
            quote.FrequencyPerWeek, quote.PriceVersion, selected?.SportId, selected?.Name);
    }

    public Task<Guid> CreatePendingAsync(PtPurchaseRequest request, Guid invoiceItemId,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        return lifecycle.CreatePendingAsync(new CreatePendingPtEntitlementCommand(
            request.MemberId, request.CoachId, request.MemberPackageId, request.FrequencyPerWeek, invoiceItemId),
            cancellationToken);
    }

    public Task ActivateAsync(Guid ptEntitlementId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        return ActivateForInvoiceItemAsync(ptEntitlementId, cancellationToken);
    }

    public async Task<PtRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, Guid? relatedEntitlementId,
        CancellationToken cancellationToken = default)
    {
        var row = await db.Set<PtEntitlement>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ActivationReference == invoiceItemId
                || (relatedEntitlementId != null && x.EntitlementId == relatedEntitlementId), cancellationToken);
        return row is null ? null : new PtRefundFacts(row.MemberId, row.ReservedSessions, row.ConsumedSessions,
            row.Status.ToString());
    }

    public async Task CancelByInvoiceItemAsync(Guid invoiceItemId, Guid? relatedEntitlementId, string reason, Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var entitlementId = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(x => x.ActivationReference == invoiceItemId
                || (relatedEntitlementId != null && x.EntitlementId == relatedEntitlementId))
            .Select(x => (Guid?)x.EntitlementId).SingleOrDefaultAsync(cancellationToken);
        if (entitlementId is null) return;
        await sessions.CancelScheduledForRefundAsync(entitlementId.Value, reason, actorUserId, cancellationToken);
        await lifecycle.CancelAsync(entitlementId.Value, reason, cancellationToken);
    }

    private async Task ActivateForInvoiceItemAsync(Guid ptEntitlementId, CancellationToken cancellationToken)
    {
        var invoiceItemId = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(x => x.EntitlementId == ptEntitlementId)
            .Select(x => x.ActivationReference)
            .SingleOrDefaultAsync(cancellationToken);
        await lifecycle.ActivateAsync(ptEntitlementId, invoiceItemId ?? ptEntitlementId, cancellationToken);
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
