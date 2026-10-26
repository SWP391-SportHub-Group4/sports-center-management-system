using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class DayPassClockTests
{
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
