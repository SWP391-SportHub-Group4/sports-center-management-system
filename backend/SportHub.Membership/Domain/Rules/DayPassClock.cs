using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Configuration;

namespace SportHub.Membership.Domain.Rules;

/// <summary>Giờ bán và hết hạn của vé Gym 1 ngày theo giờ hoạt động trung tâm (system setting), giờ Việt Nam.</summary>
public static class DayPassClock
{
    public static bool IsOpen(DateTime utc, CenterOperatingHours hours)
    {
        var hour = VietnamTime.ToLocal(utc).TimeOfDay;
        return hour >= TimeSpan.FromMinutes(hours.OpeningMinute)
            && hour < TimeSpan.FromMinutes(hours.ClosingMinute);
    }

    public static DateTime ClosesAtUtc(DateTime utc, CenterOperatingHours hours)
    {
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(utc));
        return VietnamTime.ToUtc(localDate.ToDateTime(TimeOnly.MinValue.AddMinutes(hours.ClosingMinute)));
    }

    public static bool CanActivate(DateTime checkoutCreatedUtc, DateTime providerPaidUtc, DateTime nowUtc, CenterOperatingHours hours)
    {
        var checkoutDay = DateOnly.FromDateTime(VietnamTime.ToLocal(checkoutCreatedUtc));
        return IsOpen(providerPaidUtc, hours) && IsOpen(nowUtc, hours)
            && DateOnly.FromDateTime(VietnamTime.ToLocal(providerPaidUtc)) == checkoutDay
            && DateOnly.FromDateTime(VietnamTime.ToLocal(nowUtc)) == checkoutDay;
    }
}
