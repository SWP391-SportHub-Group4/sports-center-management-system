using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Reporting;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>Cash by Vietnam payment/payout date. Summary, dimensions and exports share these allocations.</summary>
public sealed class RevenueReportService(ISportHubDbContext db, IRevenueDimensionReader dimensions) : IRevenueReportService
{
    private sealed record Entry(DateOnly Date, string Source, int? SportId, string? SportName, Guid? MemberId,
        decimal Cash = 0, decimal Refund = 0, decimal Obligation = 0, decimal Legacy = 0,
        long Spent = 0, long Issued = 0, long PointsRefunded = 0, long Adjustment = 0,
        Guid? PaymentId = null, Guid? InvoiceId = null, Guid? RefundId = null);

    public async Task<RevenueReportResponse> GetAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default,
        int? sportId = null, string? source = null, Guid? memberId = null)
    {
        if (toDate < fromDate) (fromDate, toDate) = (toDate, fromDate);
        if (toDate.DayNumber - fromDate.DayNumber >= 366)
            throw new BadRequestException("range_too_large", "The revenue report range cannot exceed 366 days.");
        var periodStart = VietnamTime.StartOfDayUtc(fromDate);
        var periodEnd = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var payments = await db.Set<Domain.Entities.Payment>().AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Success && p.PaidAt >= periodStart && p.PaidAt < periodEnd)
            .Select(p => new { p.PaymentId, p.InvoiceId, p.PaidAt, p.Amount, p.Method }).ToListAsync(ct);
        var adjustments = await db.Set<PaymentAdjustment>().AsNoTracking()
            .Where(a => a.Status == PaymentAdjustmentStatus.Completed && a.CompletedAtUtc >= periodStart && a.CompletedAtUtc < periodEnd
                && a.PointLedgerEntryId == null)
            .Select(a => new { a.AdjustmentId, a.InvoiceId, a.InvoiceItemId, a.CompletedAtUtc, a.Amount, a.Type }).ToListAsync(ct);
        var credits = await (from e in db.Set<VerifiedGatewayEvent>().AsNoTracking()
                            join a in db.Set<PaymentAttempt>().AsNoTracking() on e.PaymentAttemptId equals a.PaymentAttemptId
                            where (e.ProcessingStatus == "Compensated" || e.ProcessingStatus == "ManualCompensationRequired")
                                && e.ProviderPaidAtUtc >= periodStart && e.ProviderPaidAtUtc < periodEnd
                            select new { e.ProviderPaidAtUtc, e.Amount, a.InvoiceId }).ToListAsync(ct);
        var points = await (from e in db.Set<PointLedgerEntry>().AsNoTracking()
                            join w in db.Set<PointWallet>().AsNoTracking() on e.WalletId equals w.WalletId
                            where e.CreatedAtUtc >= periodStart && e.CreatedAtUtc < periodEnd
                                && (e.EntryType == PointEntryType.Spend || e.EntryType == PointEntryType.Earn || e.EntryType == PointEntryType.Adjustment)
                            select new { e.CreatedAtUtc, e.EntryType, e.Points, e.AvailableDelta, e.InvoiceItemId, e.ReferenceType, w.OwnerUserId })
            .ToListAsync(ct);
        var invoiceIds = payments.Select(p => p.InvoiceId).Union(adjustments.Select(a => a.InvoiceId))
            .Union(credits.Select(e => e.InvoiceId)).ToArray();
        var pointItemIds = points.Where(e => e.InvoiceItemId.HasValue).Select(e => e.InvoiceItemId!.Value).ToArray();
        var items = await db.Set<InvoiceItem>().AsNoTracking()
            .Where(i => invoiceIds.Contains(i.InvoiceId) || pointItemIds.Contains(i.ItemId))
            .Select(i => new { i.ItemId, i.InvoiceId, i.ItemType, i.LineAmount }).ToListAsync(ct);
        var allInvoiceIds = invoiceIds.Union(items.Select(i => i.InvoiceId)).ToArray();
        var invoices = await db.Set<Invoice>().AsNoTracking().Where(i => allInvoiceIds.Contains(i.InvoiceId))
            .Select(i => new { i.InvoiceId, i.TotalAmount, i.MemberId }).ToDictionaryAsync(i => i.InvoiceId, ct);
        var dimensionMap = await dimensions.ReadAsync(items.Select(i => i.ItemId).ToArray(), ct);
        var itemMap = items.ToDictionary(i => i.ItemId);
        var invoiceItems = items.ToLookup(i => i.InvoiceId);
        var entries = new List<Entry>();
        static DateOnly Day(DateTime date) => DateOnly.FromDateTime(VietnamTime.ToLocal(date));
        Entry ItemEntry(Guid itemId, DateOnly date, Guid? owner)
        {
            var item = itemMap.GetValueOrDefault(itemId);
            var dimension = dimensionMap.GetValueOrDefault(itemId);
            return new(date, item?.ItemType.ToString() ?? "Unclassified", dimension?.SportId,
                dimension?.SportName, dimension?.MemberId ?? owner);
        }
        foreach (var payment in payments)
        {
            var invoice = invoices.GetValueOrDefault(payment.InvoiceId);
            var allocated = 0m;
            foreach (var item in invoiceItems[payment.InvoiceId])
            {
                var cash = invoice is { TotalAmount: > 0 } ? payment.Amount * item.LineAmount / invoice.TotalAmount : 0m;
                allocated += cash;
                entries.Add(ItemEntry(item.ItemId, Day(payment.PaidAt), invoice?.MemberId) with
                { Cash = cash, Legacy = payment.Method != PaymentMethod.VnPay ? cash : 0m, PaymentId = payment.PaymentId, InvoiceId = payment.InvoiceId });
            }
            var remainder = payment.Amount - allocated;
            if (remainder != 0)
                entries.Add(new(Day(payment.PaidAt), "LegacyUnclassified", null, null, invoice?.MemberId,
                    Cash: remainder, Legacy: payment.Method != PaymentMethod.VnPay ? remainder : 0m,
                    PaymentId: payment.PaymentId, InvoiceId: payment.InvoiceId));
        }
        foreach (var credit in credits)
            entries.Add(new(Day(credit.ProviderPaidAtUtc), "Reconciliation", null, null,
                invoices.GetValueOrDefault(credit.InvoiceId)?.MemberId, Cash: credit.Amount));
        foreach (var adjustment in adjustments)
        {
            var owner = invoices.GetValueOrDefault(adjustment.InvoiceId)?.MemberId;
            // An invoice-level legacy refund has no reliable sport/source; do not invent an allocation.
            var entry = adjustment.InvoiceItemId is Guid itemId
                ? ItemEntry(itemId, Day(adjustment.CompletedAtUtc!.Value), owner)
                : new Entry(Day(adjustment.CompletedAtUtc!.Value), "LegacyUnclassified", null, null, owner);
            entries.Add(adjustment.Type == PaymentAdjustmentType.Refund
                ? entry with { Refund = adjustment.Amount, RefundId = adjustment.AdjustmentId }
                : entry with { Obligation = adjustment.Amount });
        }
        foreach (var point in points)
        {
            var entry = point.InvoiceItemId is Guid itemId
                ? ItemEntry(itemId, Day(point.CreatedAtUtc), point.OwnerUserId)
                : new Entry(Day(point.CreatedAtUtc), "Unclassified", null, null, point.OwnerUserId);
            entries.Add(entry with
            {
                Spent = point.EntryType == PointEntryType.Spend ? point.Points : 0,
                Issued = point.EntryType == PointEntryType.Earn ? point.Points : 0,
                PointsRefunded = point.EntryType == PointEntryType.Earn && point.ReferenceType is "PaymentAdjustment" or "SystemEvent" or "ClassTransferDifference" ? point.Points : 0,
                Adjustment = point.EntryType == PointEntryType.Adjustment ? point.AvailableDelta : 0
            });
        }
        var selected = entries.Where(e => (!sportId.HasValue || e.SportId == sportId)
            && (!memberId.HasValue || e.MemberId == memberId)
            && (string.IsNullOrWhiteSpace(source) || string.Equals(e.Source.Replace("_", ""), source.Replace("_", ""), StringComparison.OrdinalIgnoreCase))).ToList();
        var byDay = selected.ToLookup(e => e.Date);
        var daily = Enumerable.Range(0, toDate.DayNumber - fromDate.DayNumber + 1).Select(offset =>
        {
            var date = fromDate.AddDays(offset);
            var rows = byDay[date];
            return new RevenueReportRowResponse(date, rows.Sum(e => e.Cash), rows.Sum(e => e.Refund),
                rows.Sum(e => e.Obligation), rows.Sum(e => e.Cash - e.Refund))
            { LegacyCashCollected = rows.Sum(e => e.Legacy), ReconciliationCashCollected = rows.Where(e => e.Source == "Reconciliation").Sum(e => e.Cash) };
        }).ToList();
        var cashEntries = selected.Where(e => e.Cash != 0 || e.Spent != 0).ToList();
        var sourceRows = cashEntries.GroupBy(e => e.Source).OrderBy(g => g.Key)
            .Select(g => new RevenueReportSourceRowResponse(g.Key, g.Sum(e => e.Cash), g.Sum(e => e.Spent))).ToList();
        var dimensionRows = cashEntries.GroupBy(e => new { e.Source, e.SportId, e.SportName, e.MemberId })
            .Select(g => new RevenueReportDimensionRowResponse(g.Key.Source, g.Key.SportId, g.Key.SportName, g.Key.MemberId,
                g.Sum(e => e.Cash), g.Sum(e => e.Legacy), g.Sum(e => e.Spent)))
            .OrderBy(r => r.Source).ThenBy(r => r.SportId).ThenBy(r => r.MemberId).ToList();
        var outstandingAt = DateTime.UtcNow;
        var outstanding = await db.Set<PointWallet>().AsNoTracking().Where(w => !memberId.HasValue || w.OwnerUserId == memberId)
            .SumAsync(w => (long)w.AvailablePoints + w.HeldPoints, ct);
        return new(fromDate, toDate, selected.Sum(e => e.Cash), selected.Sum(e => e.Refund), selected.Sum(e => e.Obligation),
            selected.Sum(e => e.Cash - e.Refund), selected.Where(e => e.InvoiceId.HasValue).Select(e => e.InvoiceId).Distinct().Count(),
            selected.Where(e => e.PaymentId.HasValue).Select(e => e.PaymentId).Distinct().Count(),
            selected.Where(e => e.RefundId.HasValue).Select(e => e.RefundId).Distinct().Count(), daily)
        {
            LegacyCashCollected = selected.Sum(e => e.Legacy),
            ReconciliationCashCollected = selected.Where(e => e.Source == "Reconciliation").Sum(e => e.Cash),
            ReconciliationCashCount = selected.Count(e => e.Source == "Reconciliation"),
            PointsRedeemed = selected.Sum(e => e.Spent), PointsIssued = selected.Sum(e => e.Issued),
            PointsRefunded = selected.Sum(e => e.PointsRefunded), ManagerPointAdjustment = selected.Sum(e => e.Adjustment),
            OutstandingPoints = outstanding, OutstandingPointsAsOfUtc = outstandingAt,
            BySource = sourceRows, BySportAndSource = dimensionRows
        };
    }
}

