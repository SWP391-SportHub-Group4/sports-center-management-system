using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Configuration;

namespace SportHub.Membership.Domain.Rules;

public static class DayPassClock
{
    public static bool IsOpen(DateTime utc, CenterOperatingHours? hours = null)
    {
        var hour = VietnamTime.ToLocal(utc).TimeOfDay;
        return hour >= TimeSpan.FromMinutes(hours?.OpeningMinute ?? DayPass.SaleOpensHourLocal * 60)
            && hour < TimeSpan.FromMinutes(hours?.ClosingMinute ?? DayPass.ClosesHourLocal * 60);
    }

    public static DateTime ClosesAtUtc(DateTime utc, CenterOperatingHours? hours = null)
    {
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(utc));
        return VietnamTime.ToUtc(localDate.ToDateTime(TimeOnly.MinValue.AddMinutes(hours?.ClosingMinute ?? DayPass.ClosesHourLocal * 60)));
    }

    public static bool CanActivate(DateTime checkoutCreatedUtc, DateTime providerPaidUtc, DateTime nowUtc, CenterOperatingHours? hours = null)
    {
        var checkoutDay = DateOnly.FromDateTime(VietnamTime.ToLocal(checkoutCreatedUtc));
        return IsOpen(providerPaidUtc, hours) && IsOpen(nowUtc, hours)
            && DateOnly.FromDateTime(VietnamTime.ToLocal(providerPaidUtc)) == checkoutDay
            && DateOnly.FromDateTime(VietnamTime.ToLocal(nowUtc)) == checkoutDay;
    }
}
