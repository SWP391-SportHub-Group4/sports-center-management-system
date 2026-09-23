using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;

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

            daily.Add(new RevenueReportRowResponse(day, collected, refunded, obligation, collected - refunded));
        }

        var totalCollected = collectedByDay.Values.Sum();
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
            daily);
    }
}
