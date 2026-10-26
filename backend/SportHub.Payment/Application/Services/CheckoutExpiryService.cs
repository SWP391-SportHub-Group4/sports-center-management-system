using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Payment.Application.Services;

public sealed class CheckoutExpiryService(ISportHubDbContext db, PaymentFulfillmentService fulfillment,
    PaymentReconciliationService reconciliation, IClock clock, ILogger<CheckoutExpiryService> logger)
{
    private const int GatewayGraceMinutes = 15;

    public async Task<int> ExpireDueAsync(CancellationToken ct)
    {
        var ids = await db.Set<Invoice>().AsNoTracking()
            .Where(x => x.Status == InvoiceStatus.Issued && x.CheckoutCycleId != null
                && x.HoldExpiresAtUtc <= clock.UtcNow
                && db.Set<CheckoutSession>().Any(s => s.CheckoutSessionId == x.CheckoutCycleId)
                && !db.Set<VerifiedGatewayEvent>().Any(e =>
                    e.ProcessingStatus != "Failed" && e.ProcessingStatus != "Fulfilled"
                    && e.ProcessingStatus != "Compensated" && db.Set<PaymentAttempt>()
                        .Any(a => a.PaymentAttemptId == e.PaymentAttemptId && a.InvoiceId == x.InvoiceId)))
            // Exclude protected invoices before Take; otherwise 100 stalled captures can
            // prevent every later checkout from ever being released.
            .OrderBy(x => x.HoldExpiresAtUtc).Take(100).Select(x => x.InvoiceId).ToListAsync(ct);
        var count = 0;
        foreach (var id in ids)
        {
            // Ask VNPay before releasing a seat or court. A verified capture is processed first.
            var attemptId = await db.Set<PaymentAttempt>().AsNoTracking()
                .Where(a => a.InvoiceId == id && a.Status == PaymentAttemptStatus.Pending
                    && !db.Set<VerifiedGatewayEvent>().Any(e => e.PaymentAttemptId == a.PaymentAttemptId))
                .OrderByDescending(a => a.CreatedAt)
                .Select(a => (Guid?)a.PaymentAttemptId).FirstOrDefaultAsync(ct);
            if (attemptId is Guid pendingAttempt)
            {
                try { await reconciliation.ReconcileAttemptAsync(pendingAttempt, ct); }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "VNPay QueryDR failed before expiry for invoice {InvoiceId}", id);
                    // Keep the hold briefly so a transient gateway error does not release a paid seat,
                    // but never forever: a payment that lands later is still handled by reconciliation.
                    var heldSince = await db.Set<Invoice>().AsNoTracking().Where(x => x.InvoiceId == id)
                        .Select(x => x.HoldExpiresAtUtc).SingleOrDefaultAsync(ct);
                    if (heldSince is null || clock.UtcNow < heldSince.Value.AddMinutes(GatewayGraceMinutes))
                        continue;
                }
            }
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var invoice = await db.Set<Invoice>().FromSqlInterpolated(
                $"SELECT * FROM invoices WHERE invoice_id = {id} FOR UPDATE SKIP LOCKED")
                .SingleOrDefaultAsync(ct);
            if (invoice is null || invoice.Status != InvoiceStatus.Issued
                || invoice.HoldExpiresAtUtc > clock.UtcNow)
            {
                await tx.CommitAsync(ct);
                continue;
            }
            var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
                x => x.CheckoutSessionId == invoice.CheckoutCycleId, ct);
            if (session is null) { await tx.CommitAsync(ct); continue; }
            var unprocessedCapture = await db.Set<VerifiedGatewayEvent>().AnyAsync(e =>
                e.ProcessingStatus != "Failed" && e.ProcessingStatus != "Fulfilled"
                && e.ProcessingStatus != "Compensated" && db.Set<PaymentAttempt>()
                    .Any(a => a.PaymentAttemptId == e.PaymentAttemptId && a.InvoiceId == id), ct);
            if (unprocessedCapture) { await tx.CommitAsync(ct); continue; }
            await fulfillment.ReleaseAsync(invoice, session, "Expired", null, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            count++;
        }
        return count;
    }
}
