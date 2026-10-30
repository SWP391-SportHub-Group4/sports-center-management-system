using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class PointRefundCalculatorTests
{
    [Theory]
    [InlineData(3000, 1, 3, 1000)]
    [InlineData(3000, 2, 3, 2000)]
    [InlineData(100000, 2, 3, 66666)]
    public void Session_proration_rounds_only_after_multiplication(int paid, int remaining, int total, int expected)
        => Assert.Equal(expected, new SportHub.BuildingBlocks.Abstractions.Payment.RefundFraction(remaining, total).Apply(paid));

    // Member tự hủy Gym: không hoàn ở mọi thời điểm, dù còn bao nhiêu ngày (BR-91).
    [Theory]
    [InlineData("2026-01-01", "2026-12-31", "2026-05-02")]
    [InlineData("2026-01-01", "2026-12-31", "2026-05-03")]
    [InlineData("2026-01-01", "2026-03-31", "2026-01-31")] // Trước đây là đúng 60/90 ngày còn lại (hoàn 50%).
    [InlineData("2026-01-01", "2026-03-31", "2026-02-01")]
    [InlineData("2026-01-01", "2026-03-31", "2025-12-15")] // Gói trả trước, chưa bắt đầu.
    [InlineData("2026-01-01", "2026-03-31", "2026-01-01")]
    [InlineData("2026-01-01", "2026-03-31", "2026-03-31")]
    [InlineData("2026-01-01", "2026-03-31", "2026-04-01")]
    [InlineData("2028-02-01", "2028-02-29", "2028-02-10")]
    [InlineData("2026-01-02", "2026-01-01", "2026-01-01")]
    public void Membership_self_cancellation_is_never_refunded(string start, string end, string request)
    {
        var result = RefundCalculator.MembershipPoints(1_000_999,
            DateOnly.Parse(start), DateOnly.Parse(end), DateOnly.Parse(request));
        Assert.Equal(0, result);
    }

    [Theory]
    [InlineData(10 * 24)]
    [InlineData(5 * 24)]
    [InlineData(5 * 24 - 1)]
    [InlineData(1)]
    [InlineData(-1)]
    public void Class_self_cancellation_is_never_refunded_before_or_after_the_first_session(int hoursUntilFirst)
        => Assert.Equal(0, RefundCalculator.ClassPoints(1_000_000, 10, 10, TimeSpan.FromHours(hoursUntilFirst)));

    [Fact]
    public void Center_cancellation_refunds_full_before_start_and_the_unprovided_share_after()
    {
        Assert.Equal(1_000, RefundCalculator.ClassPoints(1_000_000, 10, 10, TimeSpan.FromHours(2), centerFault: true));
        Assert.Equal(300, RefundCalculator.ClassPoints(1_000_000, 10, 3, TimeSpan.FromHours(-1), centerFault: true));
    }

    // Member tự hủy lượt thuê sân: không hoàn dù hủy sớm hay muộn (BR-129).
    [Theory]
    [InlineData(48)]
    [InlineData(24)]
    [InlineData(23)]
    [InlineData(1)]
    public void Rental_self_cancellation_is_never_refunded(int hoursBefore)
    {
        var start = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.FromHours(7));
        Assert.Equal(0, RefundCalculator.RentalPoints(1_000_999,
            start.AddHours(-hoursBefore), start));
    }

    [Fact]
    public void Rental_cancelled_by_the_center_is_refunded_in_full()
    {
        var start = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.FromHours(7));
        Assert.Equal(1_000, RefundCalculator.RentalPoints(1_000_999, start.AddHours(-1), start, cancelledByCenter: true));
    }

    [Fact]
    public void Center_fault_rounds_the_unused_value_without_losing_an_exact_point_to_a_repeating_percentage()
        => Assert.Equal(1, RefundCalculator.MembershipPoints(3_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 3), new DateOnly(2026, 1, 3), centerFault: true));

    [Fact]
    public void Center_fault_refunds_only_the_unused_share_and_fractional_vnd_is_floored_to_points()
    {
        Assert.Equal(1_000, RefundCalculator.MembershipPoints(1_000_999,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), new DateOnly(2026, 1, 1), centerFault: true));
        Assert.Equal(500, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 10), new DateOnly(2026, 1, 6), centerFault: true));
        Assert.Equal(545, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 11), new DateOnly(2026, 1, 6), centerFault: true));
        Assert.Equal(100, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 10), new DateOnly(2026, 1, 10), centerFault: true));
        Assert.Equal(0, RefundCalculator.MembershipPoints(1_000_000,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 11), new DateOnly(2026, 2, 1), centerFault: true));
        Assert.Equal(499, RefundCalculator.PointsForRatio(999_999, 50));
    }
}
