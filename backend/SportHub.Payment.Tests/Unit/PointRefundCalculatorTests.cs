using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class PointRefundCalculatorTests
{
    [Theory]
    [InlineData("2026-01-01", "2026-12-31", "2026-05-02", 500)]
    [InlineData("2026-01-01", "2026-12-31", "2026-05-03", 0)]
    public void Membership_uses_two_thirds_boundary_and_returns_points(
        string start, string end, string request, int expected)
    {
        var result = RefundCalculator.MembershipPoints(1_000_999,
            DateOnly.Parse(start), DateOnly.Parse(end), DateOnly.Parse(request));
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData(10 * 24, 1_000)]
    [InlineData(5 * 24, 1_000)]
    [InlineData(5 * 24 - 1, 500)]
    [InlineData(1, 500)]
    [InlineData(-1, 0)]
    public void Class_refund_is_full_five_days_out_half_after_and_none_once_started(int hoursUntilFirst, int expected)
        => Assert.Equal(expected, RefundCalculator.ClassPoints(1_000_000, 10, 10, TimeSpan.FromHours(hoursUntilFirst)));

    [Fact]
    public void Center_cancellation_refunds_full_before_start_and_the_unprovided_share_after()
    {
        Assert.Equal(1_000, RefundCalculator.ClassPoints(1_000_000, 10, 10, TimeSpan.FromHours(2), centerFault: true));
        Assert.Equal(300, RefundCalculator.ClassPoints(1_000_000, 10, 3, TimeSpan.FromHours(-1), centerFault: true));
    }

    [Theory]
    [InlineData(24, 1000)]
    [InlineData(23, 0)]
    public void Rental_uses_24_hour_boundary(int hoursBefore, int expected)
    {
        var start = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.FromHours(7));
        Assert.Equal(expected, RefundCalculator.RentalPoints(1_000_999,
            start.AddHours(-hoursBefore), start));
    }

    [Fact]
    public void Center_fault_refunds_only_the_unused_share_and_fractional_vnd_is_floored_to_points()
    {
        Assert.Equal(1_000, RefundCalculator.MembershipPoints(1_000_999,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), new DateOnly(2026, 1, 1), centerFault: true));
        Assert.Equal(500, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 11), new DateOnly(2026, 1, 6), centerFault: true));
        Assert.Equal(0, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 11), new DateOnly(2026, 2, 1), centerFault: true));
        Assert.Equal(499, RefundCalculator.PointsForRatio(999_999, 50));
    }
}
