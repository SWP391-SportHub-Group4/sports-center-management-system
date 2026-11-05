using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Reporting;

namespace SportHub.Payment.Application.Services;

public sealed class PaidInvoiceReportReader(ISportHubDbContext db) : IPaidInvoiceReportReader
{
    // Keep historical paid bookings after cancellation/refunds. A successful
    // point-only checkout has a paid invoice without a cash Payment row.
    public IQueryable<Guid> PaidInvoiceIds => db.Set<Invoice>().AsNoTracking()
        .Where(i => i.Status == InvoiceStatus.Paid || i.Status == InvoiceStatus.PaidAfterReconciliation
            || i.PaidAtUtc != null)
        .Select(i => i.InvoiceId);

    public IQueryable<Guid> PaidInvoiceItemIds => db.Set<InvoiceItem>().AsNoTracking()
        .Where(i => PaidInvoiceIds.Contains(i.InvoiceId)).Select(i => i.ItemId);
}
