using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Báo cáo doanh thu — BR-32 (chỉ Center Manager) và BR-43 v1.4.
///
/// Chỉ tiêu THU RÒNG = Payment Success theo ngày thu − Refund Completed theo ngày THỰC TRẢ.
/// Discount/Correction KHÔNG trừ vào chỉ tiêu này; chúng được trả ra một cột riêng vì là
/// điều chỉnh nghĩa vụ, không phải tiền đi ra. Bản v1.3 cộng cả ba loại vào một số "adjusted"
/// và trừ hết — khi một khoản giảm giá sau đó được hoàn lại bằng tiền thì cùng một khoản bị
/// trừ hai lần khỏi doanh thu.
///
/// Ngày quy kỳ của Refund là <c>CompletedAtUtc</c>, không phải ngày duyệt: một khoản duyệt
/// cuối tháng 9 nhưng chi tiền đầu tháng 10 làm giảm thu ròng của THÁNG 10.
///
/// Kỳ được chia theo NGÀY GIỜ VIỆT NAM (SSOT §5.3): mốc lưu trong DB là UTC nên biên của
/// mỗi ngày là [00:00 VN, 00:00 VN hôm sau) quy đổi sang UTC. Nếu cắt thẳng theo ngày UTC,
/// mọi giao dịch từ 00:00–07:00 giờ VN sẽ rơi nhầm sang ngày hôm trước.
/// </summary>
public sealed class RevenueReportService(ISportHubDbContext db,
    SportHub.BuildingBlocks.Abstractions.Reporting.IRevenueDimensionReader dimensions) : IRevenueReportService
{
    public async Task<RevenueReportResponse> GetAsync(
        DateOnly fromDate,
        DateOnly toDate,
        CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        if (toDate.DayNumber - fromDate.DayNumber > 366)
            throw new SportHub.BuildingBlocks.SharedKernel.Errors.BadRequestException(
                "range_too_large", "Khoảng báo cáo tối đa 366 ngày.");
        var toUtcExclusive = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var payments = await db.Set<Domain.Entities.Payment>()
            .AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Success && p.PaidAt >= fromUtc && p.PaidAt < toUtcExclusive)
            .Select(p => new { p.PaidAt, p.Amount, p.InvoiceId, p.Method })
            .ToListAsync(ct);

        // If a successful gateway capture cannot activate its benefit, it is credited as
        // points (or flagged for manual settlement) and has no Payment row. Keep that real
        // cash visible in a separate reconciliation line, dated by verified provider pay time.
        var reconciliationCash = await db.Set<VerifiedGatewayEvent>()
            .AsNoTracking()
            .Where(e => (e.ProcessingStatus == "Compensated" || e.ProcessingStatus == "ManualCompensationRequired")
                        && e.ProviderPaidAtUtc >= fromUtc && e.ProviderPaidAtUtc < toUtcExclusive)
            .Select(e => new { e.ProviderPaidAtUtc, e.Amount })
            .ToListAsync(ct);

        var pointEntries = await db.Set<PointLedgerEntry>()
            .AsNoTracking()
            .Where(e => e.CreatedAtUtc >= fromUtc && e.CreatedAtUtc < toUtcExclusive
                        && (e.EntryType == PointEntryType.Spend || e.EntryType == PointEntryType.Earn
                            || e.EntryType == PointEntryType.Adjustment))
            .Select(e => new { e.EntryType, e.Points, e.AvailableDelta, e.InvoiceItemId })
            .ToListAsync(ct);

        var outstandingPoints = await db.Set<PointWallet>()
            .AsNoTracking().SumAsync(w => (long)w.AvailablePoints + w.HeldPoints, ct);

        var sourceCashRows = await (from item in db.Set<InvoiceItem>().AsNoTracking()
                                    join invoice in db.Set<Invoice>().AsNoTracking() on item.InvoiceId equals invoice.InvoiceId
                                    join payment in db.Set<Domain.Entities.Payment>().AsNoTracking() on invoice.InvoiceId equals payment.InvoiceId
                                    where payment.Status == PaymentStatus.Success
                                          && payment.PaidAt >= fromUtc && payment.PaidAt < toUtcExclusive
                                    select new { item.ItemId, Source = item.ItemType.ToString(), item.LineAmount,
                                        invoice.TotalAmount, payment.Amount, payment.Method })
            .ToListAsync(ct);

        var pointItemIds = pointEntries.Where(e => e.InvoiceItemId.HasValue)
            .Select(e => e.InvoiceItemId!.Value).Distinct().ToArray();
        var pointItemSources = await db.Set<InvoiceItem>().AsNoTracking()
            .Where(i => pointItemIds.Contains(i.ItemId))
            .Select(i => new { i.ItemId, Source = i.ItemType.ToString() })
            .ToDictionaryAsync(i => i.ItemId, i => i.Source, ct);

        // Chỉ Refund có CompletedAtUtc (đã xác nhận thực trả) mới vào đây. Bản ghi legacy
        // Completed mà thiếu CompletedAtUtc bị loại khỏi chỉ tiêu tiền thay vì bị gán bừa ngày
        // duyệt — xem docs/legacy-refund-reconciliation.md.
        var refunds = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                        && a.Type == PaymentAdjustmentType.Refund
                        && a.CompletedAtUtc != null
                        && a.CompletedAtUtc >= fromUtc
                        && a.CompletedAtUtc < toUtcExclusive)
            .Select(a => new { CompletedAt = a.CompletedAtUtc!.Value, a.Amount })
            .ToListAsync(ct);

        var obligationChanges = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                        && a.Type != PaymentAdjustmentType.Refund
                        && a.CompletedAtUtc != null
                        && a.CompletedAtUtc >= fromUtc
                        && a.CompletedAtUtc < toUtcExclusive)
            .Select(a => new { CompletedAt = a.CompletedAtUtc!.Value, a.Amount })
            .ToListAsync(ct);

        var legacyCashCollected = payments.Where(p => p.Method != PaymentMethod.VnPay).Sum(p => p.Amount);
        var reconciliationByDay = reconciliationCash
            .GroupBy(e => DateOnly.FromDateTime(VietnamTime.ToLocal(e.ProviderPaidAtUtc)))
            .ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));
        var pointsRedeemed = pointEntries.Where(e => e.EntryType == PointEntryType.Spend).Sum(e => (long)e.Points);
        var pointsIssued = pointEntries.Where(e => e.EntryType == PointEntryType.Earn).Sum(e => (long)e.Points);
        var managerPointAdjustment = pointEntries.Where(e => e.EntryType == PointEntryType.Adjustment)
            .Sum(e => (long)e.AvailableDelta);

        var sourceCash = sourceCashRows
            .GroupBy(x => x.Source)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.TotalAmount == 0 ? 0 : x.Amount * x.LineAmount / x.TotalAmount));
        var sourcePoints = pointEntries.Where(e => e.EntryType == PointEntryType.Spend)
            .GroupBy(e => e.InvoiceItemId is Guid id && pointItemSources.TryGetValue(id, out var source)
                ? source : "Unclassified")
            .ToDictionary(g => g.Key, g => g.Sum(e => (long)e.Points));
        var sourceRows = sourceCash.Keys.Union(sourcePoints.Keys).OrderBy(x => x)
            .Select(source => new RevenueReportSourceRowResponse(source,
                sourceCash.GetValueOrDefault(source), sourcePoints.GetValueOrDefault(source)))
            .ToList();

        var dimensionMap = await dimensions.ReadAsync(sourceCashRows.Select(x => x.ItemId)
            .Union(pointItemIds).ToArray(), ct);
        var dimensionCash = sourceCashRows.Select(x => new
        {
            x.Source, Dimension = dimensionMap.GetValueOrDefault(x.ItemId),
            Cash = x.TotalAmount == 0 ? 0 : x.Amount * x.LineAmount / x.TotalAmount,
            Legacy = x.Method != PaymentMethod.VnPay, Points = 0L
        });
        var dimensionPoints = pointEntries.Where(x => x.EntryType == PointEntryType.Spend).Select(x => new
        {
            Source = x.InvoiceItemId is Guid id ? pointItemSources.GetValueOrDefault(id, "Unclassified") : "Unclassified",
            Dimension = x.InvoiceItemId is Guid itemId ? dimensionMap.GetValueOrDefault(itemId) : null,
            Cash = 0m, Legacy = false, Points = (long)x.Points
        });
        var dimensionRows = dimensionCash.Concat(dimensionPoints)
            .GroupBy(x => new { x.Source, x.Dimension })
            .Select(g => new RevenueReportDimensionRowResponse(g.Key.Source,
                g.Key.Dimension?.SportId, g.Key.Dimension?.SportName, g.Key.Dimension?.MemberId,
                g.Sum(x => x.Cash), g.Where(x => x.Legacy).Sum(x => x.Cash), g.Sum(x => x.Points)))
            .OrderBy(x => x.Source).ThenBy(x => x.SportId).ThenBy(x => x.MemberId).ToList();
        if (reconciliationCash.Count > 0)
        {
            var cash = reconciliationCash.Sum(x => x.Amount);
            sourceRows.Add(new("Reconciliation", cash, 0));
            dimensionRows.Add(new("Reconciliation", null, null, null, cash, 0, 0));
        }
        // Older invoices may have no item breakdown. Keep their cash visible without inventing a sport/source.
        var unclassifiedCash = payments.Sum(x => x.Amount) - sourceCash.Values.Sum();
        var unclassifiedLegacy = legacyCashCollected - dimensionRows.Sum(x => x.LegacyCashCollected);
        if (unclassifiedCash != 0 || unclassifiedLegacy != 0)
        {
            sourceRows.Add(new("LegacyUnclassified", unclassifiedCash, 0));
            dimensionRows.Add(new("LegacyUnclassified", null, null, null, unclassifiedCash, unclassifiedLegacy, 0));
        }

        var collectedByDay = payments
            .GroupBy(p => DateOnly.FromDateTime(VietnamTime.ToLocal(p.PaidAt)))
            .ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));

        var refundedByDay = refunds
            .GroupBy(a => DateOnly.FromDateTime(VietnamTime.ToLocal(a.CompletedAt)))
            .ToDictionary(g => g.Key, g => g.Sum(a => a.Amount));

        var obligationByDay = obligationChanges
            .GroupBy(a => DateOnly.FromDateTime(VietnamTime.ToLocal(a.CompletedAt)))
            .ToDictionary(g => g.Key, g => g.Sum(a => a.Amount));

        var daily = new List<RevenueReportRowResponse>();

        for (var day = fromDate; day <= toDate; day = day.AddDays(1))
        {
            var collected = collectedByDay.GetValueOrDefault(day);
            var refunded = refundedByDay.GetValueOrDefault(day);
            var obligation = obligationByDay.GetValueOrDefault(day);
            var reconciliation = reconciliationByDay.GetValueOrDefault(day);
            var legacy = payments.Where(p => p.Method != PaymentMethod.VnPay
                && DateOnly.FromDateTime(VietnamTime.ToLocal(p.PaidAt)) == day).Sum(p => p.Amount);

            daily.Add(new RevenueReportRowResponse(day, collected + reconciliation, refunded, obligation,
                collected + reconciliation - refunded)
            {
                ReconciliationCashCollected = reconciliation,
                LegacyCashCollected = legacy
            });
        }

        var totalCollected = collectedByDay.Values.Sum() + reconciliationCash.Sum(e => e.Amount);
        var totalRefunded = refundedByDay.Values.Sum();
        var totalObligationReduction = obligationByDay.Values.Sum();

        return new RevenueReportResponse(
            fromDate,
            toDate,
            totalCollected,
            totalRefunded,
            totalObligationReduction,
            totalCollected - totalRefunded,
            payments.Select(p => p.InvoiceId).Distinct().Count(),
            payments.Count,
            refunds.Count,
            daily)
        {
            LegacyCashCollected = legacyCashCollected,
            ReconciliationCashCollected = reconciliationCash.Sum(e => e.Amount),
            ReconciliationCashCount = reconciliationCash.Count,
            PointsRedeemed = pointsRedeemed,
            PointsIssued = pointsIssued,
            ManagerPointAdjustment = managerPointAdjustment,
            OutstandingPoints = outstandingPoints,
            BySource = sourceRows,
            BySportAndSource = dimensionRows
        };
    }
}
