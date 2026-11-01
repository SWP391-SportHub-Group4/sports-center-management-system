using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Rules;
using SportHub.BuildingBlocks.Abstractions.Configuration;

namespace SportHub.Payment.Tests.Unit;

public sealed class DayPassClockTests
{
    [Theory]
    [InlineData(8, 29, false)]
    [InlineData(8, 30, true)]
    [InlineData(20, 14, true)]
    [InlineData(20, 15, false)]
    public void Configured_hours_support_minute_boundaries(int hour, int minute, bool expected)
    {
        var hours = new CenterOperatingHours(8 * 60 + 30, 20 * 60 + 15);
        Assert.Equal(expected, DayPassClock.IsOpen(Local(hour, minute), hours));
        Assert.Equal(Local(20, 15), DayPassClock.ClosesAtUtc(Local(hour, minute), hours));
    }

    [Fact]
    public void Payment_must_be_on_the_purchase_day_and_before_configured_closing()
    {
        var hours = new CenterOperatingHours(8 * 60, 20 * 60);
        Assert.True(DayPassClock.CanActivate(Local(19, 58), Local(19, 59), Local(19, 59), hours));
        Assert.False(DayPassClock.CanActivate(Local(19, 58), Local(19, 59), Local(20, 0), hours));
        Assert.False(DayPassClock.CanActivate(Local(19, 58), Local(20, 1), Local(20, 1), hours));
        Assert.False(DayPassClock.CanActivate(Local(19, 58).AddDays(-1), Local(10, 0), Local(10, 0), hours));
    }
    private static DateTime Local(int hour, int minute)
        => VietnamTime.ToUtc(new DateTime(2026, 10, 24, hour, minute, 0));

    [Theory]
    [InlineData(5, 59, false)]
    [InlineData(6, 0, true)]
    [InlineData(21, 59, true)]
    [InlineData(22, 0, false)]
    [InlineData(22, 3, false)]
    public void Checkout_hours_follow_vietnam_local_time(int hour, int minute, bool expected)
        => Assert.Equal(expected, DayPassClock.IsOpen(Local(hour, minute)));

    [Fact]
    public void Paid_at_2203_cannot_activate_a_2158_checkout()
    {
        Assert.False(DayPassClock.CanActivate(Local(21, 58), Local(22, 3), Local(22, 3)));
        Assert.Equal(Local(22, 0), DayPassClock.ClosesAtUtc(Local(14, 0)));
    }
}
