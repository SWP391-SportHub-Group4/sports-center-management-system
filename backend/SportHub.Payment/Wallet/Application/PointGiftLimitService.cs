using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Wallet.Application;

/// <summary>Uses the same month-to-date revenue report and Vietnam calendar as the Manager Overview.</summary>
public sealed class PointGiftLimitService(IRevenueReportService reports, IClock clock)
{
    public async Task<PointGiftLimit> GetAsync(CancellationToken ct = default)
    {
        var today = VietnamTime.TodayLocal(clock);
        var from = new DateOnly(today.Year, today.Month, 1);
        var report = await reports.GetAsync(from, today, ct);
        var points = decimal.Floor(Math.Max(0m, report.NetRevenue) / PointWalletService.VndPerPoint);
        return new(from, today, report.NetRevenue, PointWalletService.VndPerPoint,
            (int)Math.Min(int.MaxValue, points));
    }
}

public sealed record PointGiftLimit(DateOnly FromDate, DateOnly ToDate, decimal NetCollectedVnd, int VndPerPoint, int MaxPoints);
