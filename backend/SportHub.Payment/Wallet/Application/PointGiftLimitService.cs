using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Payment.Wallet.Application;

/// <summary>Fixed gift limit per recipient per submission, independent of collections.</summary>
public sealed class PointGiftLimitService(IClock clock)
{
    public const int MaxGiftPoints = 10_000;

    public Task<PointGiftLimit> GetAsync(CancellationToken ct = default)
    {
        var today = VietnamTime.TodayLocal(clock);
        var from = new DateOnly(today.Year, today.Month, 1);
        return Task.FromResult(new PointGiftLimit(from, today, PointWalletService.VndPerPoint, MaxGiftPoints));
    }
}

public sealed record PointGiftLimit(DateOnly FromDate, DateOnly ToDate, int VndPerPoint, int MaxPoints);
