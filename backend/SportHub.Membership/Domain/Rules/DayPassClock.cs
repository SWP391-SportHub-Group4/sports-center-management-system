using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Domain.Rules;

/// <summary>Giờ bán và hết hạn của vé Gym 1 ngày theo giờ hoạt động trung tâm (system setting), giờ Việt Nam.</summary>
public static class DayPassClock
{
    public static bool IsOpen(CenterOperatingHours center, DateTime utc)
    {
        var minute = VietnamTime.ToLocal(utc).TimeOfDay.TotalMinutes;
        return minute >= center.OpeningMinute && minute < center.ClosingMinute;
    }

    public static DateTime ClosesAtUtc(CenterOperatingHours center, DateTime utc)
    {
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(utc));
        return VietnamTime.ToUtc(localDate.ToDateTime(TimeOnly.MinValue.AddMinutes(center.ClosingMinute)));
    }

    public static bool CanActivate(CenterOperatingHours center, DateTime checkoutCreatedUtc, DateTime providerPaidUtc, DateTime nowUtc)
    {
        var checkoutDay = DateOnly.FromDateTime(VietnamTime.ToLocal(checkoutCreatedUtc));
        return IsOpen(center, providerPaidUtc) && IsOpen(center, nowUtc)
            && DateOnly.FromDateTime(VietnamTime.ToLocal(providerPaidUtc)) == checkoutDay
            && DateOnly.FromDateTime(VietnamTime.ToLocal(nowUtc)) == checkoutDay;
    }
}
