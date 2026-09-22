using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Báo cáo doanh thu (BR-32, BR-43 — chỉ Center Manager; số liệu phải TRỪ các khoản điều
/// chỉnh hoàn thành TRONG KỲ).
///
/// Kỳ được chia theo NGÀY GIỜ VIỆT NAM (SSOT §5.3): mốc lưu trong DB là UTC nên biên của
/// mỗi ngày là [00:00 VN, 00:00 VN hôm sau) quy đổi sang UTC. Nếu cắt thẳng theo ngày UTC,
/// mọi giao dịch từ 00:00–07:00 giờ VN sẽ rơi nhầm sang ngày hôm trước.
/// </summary>
public sealed class RevenueReportService(ISportHubDbContext db) : IRevenueReportService
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
        var toUtcExclusive = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var payments = await db.Set<Domain.Entities.Payment>()
            .AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Success && p.PaidAt >= fromUtc && p.PaidAt < toUtcExclusive)
            .Select(p => new { p.PaidAt, p.Amount, p.InvoiceId })
            .ToListAsync(ct);

        // BR-43 — trừ theo kỳ HOÀN THÀNH điều chỉnh (ResolvedAt), không phải kỳ phát hành hoá đơn:
        // một khoản hoàn tiền tháng này cho hoá đơn tháng trước phải làm giảm doanh thu THÁNG NÀY.
        var adjustments = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                        && a.ResolvedAt != null
                        && a.ResolvedAt >= fromUtc
                        && a.ResolvedAt < toUtcExclusive)
            .Select(a => new { ResolvedAt = a.ResolvedAt!.Value, a.Amount })
            .ToListAsync(ct);

        var collectedByDay = payments
            .GroupBy(p => DateOnly.FromDateTime(VietnamTime.ToLocal(p.PaidAt)))
            .ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));

        var adjustedByDay = adjustments
            .GroupBy(a => DateOnly.FromDateTime(VietnamTime.ToLocal(a.ResolvedAt)))
            .ToDictionary(g => g.Key, g => g.Sum(a => a.Amount));

        var daily = new List<RevenueReportRowResponse>();

        for (var day = fromDate; day <= toDate; day = day.AddDays(1))
        {
            var collected = collectedByDay.GetValueOrDefault(day);
            var adjusted = adjustedByDay.GetValueOrDefault(day);

            daily.Add(new RevenueReportRowResponse(day, collected, adjusted, collected - adjusted));
        }

        var totalCollected = collectedByDay.Values.Sum();
        var totalAdjusted = adjustedByDay.Values.Sum();

        return new RevenueReportResponse(
            fromDate,
            toDate,
            totalCollected,
            totalAdjusted,
            totalCollected - totalAdjusted,
            payments.Select(p => p.InvoiceId).Distinct().Count(),
            payments.Count,
            daily);
    }
}
