using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class DayPassClockTests
{
    private static readonly CenterOperatingHours Default = new(360, 1320);

    private static DateTime Local(int hour, int minute)
        => VietnamTime.ToUtc(new DateTime(2026, 10, 24, hour, minute, 0));

    [Theory]
    [InlineData(5, 59, false)]
    [InlineData(6, 0, true)]
    [InlineData(21, 59, true)]
    [InlineData(22, 0, false)]
    [InlineData(22, 3, false)]
    public void Checkout_hours_follow_vietnam_local_time(int hour, int minute, bool expected)
        => Assert.Equal(expected, DayPassClock.IsOpen(Default, Local(hour, minute)));

    [Fact]
    public void Paid_at_2203_cannot_activate_a_2158_checkout()
    {
        Assert.False(DayPassClock.CanActivate(Default, Local(21, 58), Local(22, 3), Local(22, 3)));
        Assert.Equal(Local(22, 0), DayPassClock.ClosesAtUtc(Default, Local(14, 0)));
    }

    [Theory]
    [InlineData(7, 59, false)]
    [InlineData(8, 0, true)]
    [InlineData(20, 29, true)]
    [InlineData(20, 30, false)]
    public void Sale_window_follows_configured_center_hours(int hour, int minute, bool expected)
    {
        var custom = new CenterOperatingHours(8 * 60, 20 * 60 + 30);
        Assert.Equal(expected, DayPassClock.IsOpen(custom, Local(hour, minute)));
        Assert.Equal(Local(20, 30), DayPassClock.ClosesAtUtc(custom, Local(10, 0)));
    }
}
