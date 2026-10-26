using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Membership.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Payment.Application.Services;

public sealed class MembershipPurchaseReportReader(ISportHubDbContext db) : IMembershipPurchaseReportReader
{
    private IQueryable<Invoice> PaidMemberships(DateTime fromUtc, DateTime toUtcExclusive) => db.Set<Invoice>().AsNoTracking()
        .Where(invoice => invoice.PaidAtUtc >= fromUtc && invoice.PaidAtUtc < toUtcExclusive
            && (invoice.Status == InvoiceStatus.Paid || (invoice.Status == InvoiceStatus.PaidAfterReconciliation && invoice.PaidVia == "VnPayAfterReconciliation"))
            && invoice.Items.Any(item => item.ItemType == InvoiceItemType.Membership
                && db.Set<MemberPackage>().Any(mp => mp.PackageId != DayPass.PackageId
                    && (mp.InvoiceItemId == item.ItemId || mp.MemberPackageId == item.MemberPackageId || mp.MemberPackageId == item.RelatedEntityId))));

    public Task<int> CountDayPassesAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default)
        => db.Set<MemberPackage>().AsNoTracking().Where(mp => mp.PackageId == DayPass.PackageId
            && (mp.Status == SportHub.Membership.Domain.Enums.MemberPackageStatus.Active || mp.Status == SportHub.Membership.Domain.Enums.MemberPackageStatus.Expired)
            && db.Set<Invoice>().Any(i => i.PaidAtUtc >= fromUtc && i.PaidAtUtc < toUtcExclusive
                && (i.Status == InvoiceStatus.Paid || (i.Status == InvoiceStatus.PaidAfterReconciliation && i.PaidVia == "VnPayAfterReconciliation"))
                && i.Items.Any(item => item.ItemType == InvoiceItemType.Membership
                    && (item.ItemId == mp.InvoiceItemId || item.MemberPackageId == mp.MemberPackageId || item.RelatedEntityId == mp.MemberPackageId))))
            .CountAsync(ct);
    public async Task<IReadOnlyList<MembershipPurchaseDay>> ReadDailyAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default)
    {
        var rows = await PaidMemberships(fromUtc, toUtcExclusive)
            .Select(i => new { i.MemberId, i.PaidAtUtc }).ToListAsync(ct);
        var passes = await (from mp in db.Set<MemberPackage>().AsNoTracking()
            from invoice in db.Set<Invoice>().AsNoTracking()
            where mp.PackageId == DayPass.PackageId
                && (mp.Status == SportHub.Membership.Domain.Enums.MemberPackageStatus.Active
                    || mp.Status == SportHub.Membership.Domain.Enums.MemberPackageStatus.Expired)
                && invoice.PaidAtUtc >= fromUtc && invoice.PaidAtUtc < toUtcExclusive
                && (invoice.Status == InvoiceStatus.Paid
                    || (invoice.Status == InvoiceStatus.PaidAfterReconciliation && invoice.PaidVia == "VnPayAfterReconciliation"))
                && invoice.Items.Any(item => item.ItemType == InvoiceItemType.Membership
                    && (item.ItemId == mp.InvoiceItemId || item.MemberPackageId == mp.MemberPackageId
                        || item.RelatedEntityId == mp.MemberPackageId))
            select new { mp.MemberPackageId, invoice.PaidAtUtc }).ToListAsync(ct);
        DateOnly LocalDay(DateTime at) => DateOnly.FromDateTime(
            SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(at));
        var buyers = rows.GroupBy(i => LocalDay(i.PaidAtUtc!.Value))
            .ToDictionary(g => g.Key, g => g.Select(i => i.MemberId).Distinct().Count());
        // Count each paid pass once, even if legacy data has more than one invoice link.
        var dailyPasses = passes.GroupBy(p => p.MemberPackageId)
            .Select(g => LocalDay(g.Min(p => p.PaidAtUtc)!.Value))
            .GroupBy(day => day).ToDictionary(g => g.Key, g => g.Count());
        return buyers.Keys.Union(dailyPasses.Keys).OrderBy(day => day)
            .Select(day => new MembershipPurchaseDay(day, buyers.GetValueOrDefault(day), dailyPasses.GetValueOrDefault(day)))
            .ToList();
    }
    public Task<int> CountMembersAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default)
        => PaidMemberships(fromUtc, toUtcExclusive)
            .Select(invoice => invoice.MemberId).Distinct().CountAsync(ct);
}
