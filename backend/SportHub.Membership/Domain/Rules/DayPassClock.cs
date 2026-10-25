using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Domain.Rules;

public static class DayPassClock
{
    public static bool IsOpen(DateTime utc)
    {
        var hour = VietnamTime.ToLocal(utc).TimeOfDay;
        return hour >= TimeSpan.FromHours(DayPass.SaleOpensHourLocal)
            && hour < TimeSpan.FromHours(DayPass.ClosesHourLocal);
    }

    public static DateTime ClosesAtUtc(DateTime utc)
    {
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(utc));
        return VietnamTime.ToUtc(localDate.ToDateTime(new TimeOnly(DayPass.ClosesHourLocal, 0)));
    }

    public static bool CanActivate(DateTime checkoutCreatedUtc, DateTime providerPaidUtc, DateTime nowUtc)
    {
        var checkoutDay = DateOnly.FromDateTime(VietnamTime.ToLocal(checkoutCreatedUtc));
        return IsOpen(providerPaidUtc) && IsOpen(nowUtc)
            && DateOnly.FromDateTime(VietnamTime.ToLocal(providerPaidUtc)) == checkoutDay
            && DateOnly.FromDateTime(VietnamTime.ToLocal(nowUtc)) == checkoutDay;
    }
}
