using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Membership.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Application.Services;

public sealed class MembershipPurchaseReportReader(ISportHubDbContext db) : IMembershipPurchaseReportReader
{
    public Task<int> CountMembersAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default)
        => db.Set<Invoice>().AsNoTracking()
            .Where(invoice => invoice.PaidAtUtc >= fromUtc && invoice.PaidAtUtc < toUtcExclusive
                && (invoice.Status == InvoiceStatus.Paid
                    || (invoice.Status == InvoiceStatus.PaidAfterReconciliation
                        && invoice.PaidVia == "VnPayAfterReconciliation"))
                && invoice.Items.Any(item => item.ItemType == InvoiceItemType.Membership))
            .Select(invoice => invoice.MemberId).Distinct().CountAsync(ct);
}
