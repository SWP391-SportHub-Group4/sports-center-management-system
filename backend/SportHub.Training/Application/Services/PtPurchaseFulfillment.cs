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
        // PT là dịch vụ của Gym: môn của gói PT là môn có dịch vụ PT đang bật, miễn Coach đủ điều kiện PT.
        var selected = await specialties.IsPersonalTrainerAsync(request.CoachId, cancellationToken)
            ? await catalog.GetSportForServiceAsync(SportHub.BuildingBlocks.Abstractions.Scheduling.SportServiceType.PersonalTraining, cancellationToken)
            : null;
        return new PtPurchaseQuote(quote.PricePerSession, quote.TotalQuota, quote.TotalPrice,
            quote.FrequencyPerWeek, quote.PriceVersion, selected?.SportId, selected?.Name);
    }

    public async Task<Guid> CreatePendingAsync(PtPurchaseRequest request, Guid invoiceItemId,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var id = await lifecycle.CreatePendingAsync(new CreatePendingPtEntitlementCommand(
            request.MemberId, request.CoachId, request.MemberPackageId, request.FrequencyPerWeek, invoiceItemId,
            request.StartAtUtc.HasValue), cancellationToken);
        if (request.StartAtUtc is DateTime start)
            await sessions.HoldPurchaseSessionAsync(id, start, request.RoomId, request.MemberId, cancellationToken);
        return id;
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
        var pending = await db.Set<PtSession>().AsNoTracking().FirstOrDefaultAsync(
            s => s.EntitlementId == ptEntitlementId && s.Status == PtSessionStatus.PendingPayment, cancellationToken);
        if (pending is not null)
            await sessions.LockCoachAndMemberAsync(pending.CoachId, pending.MemberId, cancellationToken);
        var invoiceItemId = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(x => x.EntitlementId == ptEntitlementId)
            .Select(x => x.ActivationReference)
            .SingleOrDefaultAsync(cancellationToken);
        await lifecycle.ActivateAsync(ptEntitlementId, invoiceItemId ?? ptEntitlementId, cancellationToken);
        await sessions.ConfirmPurchaseSessionAsync(ptEntitlementId, cancellationToken);
    }

    public async Task CancelAsync(Guid ptEntitlementId, string reason, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        await sessions.ReleasePurchaseSessionAsync(ptEntitlementId, reason, cancellationToken);
        await lifecycle.CancelAsync(ptEntitlementId, reason, cancellationToken);
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("PT purchase fulfillment requires the caller's transaction.");
    }
}
