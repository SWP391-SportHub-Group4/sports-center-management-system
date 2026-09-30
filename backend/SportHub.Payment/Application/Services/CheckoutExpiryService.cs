using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Payment.Application.Services;

public sealed class CheckoutExpiryService(ISportHubDbContext db, PaymentFulfillmentService fulfillment, IClock clock)
{
    public async Task<int> ExpireDueAsync(CancellationToken ct)
    {
        var ids = await db.Set<Invoice>().AsNoTracking()
            .Where(x => x.Status == InvoiceStatus.Issued && x.CheckoutCycleId != null
                && x.HoldExpiresAtUtc <= clock.UtcNow)
            .OrderBy(x => x.HoldExpiresAtUtc).Take(100).Select(x => x.InvoiceId).ToListAsync(ct);
        var count = 0;
        foreach (var id in ids)
        {
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
