using SportHub.Payment.BankRefunds;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

/// <summary>Bank-refund suggestions use the point-refund ratios on the real VND, so every boundary must agree with the point rules.</summary>
public sealed class BankRefundPolicyTests
{
    private static readonly DateOnly Start = new(2026, 10, 1);

    [Theory]
    // 90-day term: two thirds = 60 days remaining.
    [InlineData(29, 50)]   // remaining 61 days
    [InlineData(30, 50)]   // remaining 60 days -> exactly two thirds
    [InlineData(31, 0)]    // remaining 59 days -> below
    public void Membership_boundary_is_two_thirds_of_the_term(int daysSinceStart, int expectedPercent)
    {
        var request = Start.AddDays(daysSinceStart);
        var quote = RefundCalculator.MembershipVnd(1_000_000m, Start, Start.AddDays(89), request);
        Assert.Equal(expectedPercent, quote.Percent);
        Assert.Equal(expectedPercent * 10_000m, quote.Vnd);
    }

    [Fact]
    public void Membership_amount_is_not_derived_from_rounded_points()
    {
        var quote = RefundCalculator.MembershipVnd(1_999_999m, Start, Start.AddDays(89), Start);
        Assert.Equal(999_999m, quote.Vnd);
        Assert.Equal(999, RefundCalculator.MembershipPoints(1_999_999m, Start, Start.AddDays(89), Start));
    }

    [Fact]
    public void Membership_center_fault_refunds_only_the_unused_part()
    {
        var quote = RefundCalculator.MembershipVnd(900_000m, Start, Start.AddDays(89), Start.AddDays(30), centerFault: true);
        Assert.Equal(600_000m, quote.Vnd);
    }

    [Fact]
    public void Membership_past_the_end_refunds_nothing_even_for_center_fault()
    {
        Assert.Equal(0m, RefundCalculator.MembershipVnd(900_000m, Start, Start.AddDays(89), Start.AddDays(120), true).Vnd);
    }

    [Theory]
    [InlineData(5 * 24 * 60, 100)]      // exactly 5 days before
    [InlineData(5 * 24 * 60 - 1, 50)]   // one minute under 5 days
    [InlineData(1, 50)]                 // still before the first session
    [InlineData(0, 0)]                  // the session has started
    [InlineData(-30, 0)]
    public void Class_boundary_is_five_days_before_the_first_session(int minutesUntilFirst, int expectedPercent)
    {
        var quote = RefundCalculator.ClassVnd(800_000m, 8, 8, TimeSpan.FromMinutes(minutesUntilFirst));
        Assert.Equal(expectedPercent, quote.Percent);
        Assert.Equal(800_000m * expectedPercent / 100, quote.Vnd);
    }

    [Fact]
    public void Class_center_fault_after_start_is_proportional_to_sessions_not_delivered()
    {
        var quote = RefundCalculator.ClassVnd(800_000m, 8, 2, TimeSpan.FromDays(-3), centerFault: true);
        Assert.Equal(200_000m, quote.Vnd);
        Assert.Equal(25m, quote.Percent);
    }

    [Fact]
    public void Class_center_fault_before_the_first_session_refunds_in_full()
    {
        Assert.Equal(800_000m, RefundCalculator.ClassVnd(800_000m, 8, 8, TimeSpan.FromHours(2), true).Vnd);
    }

    [Theory]
    [InlineData(24 * 60, 24, 100)]      // exactly the configured threshold
    [InlineData(24 * 60 - 1, 24, 0)]
    [InlineData(48 * 60, 48, 100)]      // a configured 48-hour window
    [InlineData(47 * 60, 48, 0)]
    public void Rental_boundary_follows_the_configured_free_cancellation_hours(int minutesBeforeStart, int freeHours, int expectedPercent)
    {
        var start = new DateTimeOffset(2026, 10, 10, 18, 0, 0, TimeSpan.FromHours(7));
        var quote = RefundCalculator.RentalVnd(300_000m, start.AddMinutes(-minutesBeforeStart), start, false, freeHours);
        Assert.Equal(expectedPercent, quote.Percent);
        Assert.Equal(3_000m * expectedPercent, quote.Vnd);
    }

    [Fact]
    public void Rental_cancelled_by_the_center_is_refunded_in_full()
    {
        var start = new DateTimeOffset(2026, 10, 10, 18, 0, 0, TimeSpan.FromHours(7));
        Assert.Equal(300_000m, RefundCalculator.RentalVnd(300_000m, start.AddMinutes(-30), start, true).Vnd);
    }

    [Fact]
    public void Quote_cannot_be_negative_or_exceed_the_paid_value()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => RefundPolicyQuote.Of(-1m, 1, 2, "x"));
        Assert.Throws<ArgumentOutOfRangeException>(() => RefundPolicyQuote.Of(100m, 3, 2, "x"));
        Assert.Equal(100m, RefundPolicyQuote.Of(100m, 1, 1, "x").Vnd);
    }

    [Theory]
    [InlineData(1_000_000, 10)]
    [InlineData(1_000_000, 70)]
    public void Membership_vnd_agrees_with_membership_points(int paid, int daysSinceStart)
    {
        var request = Start.AddDays(daysSinceStart);
        var vnd = RefundCalculator.MembershipVnd(paid, Start, Start.AddDays(89), request).Vnd;
        var points = RefundCalculator.MembershipPoints(paid, Start, Start.AddDays(89), request);
        Assert.Equal(points, (int)decimal.Floor(vnd / RefundCalculator.VndPerPoint));
    }

    [Fact]
    public void Masked_account_number_never_reveals_more_than_the_last_four_digits()
    {
        Assert.Equal("••••6789", BankRefundService.Mask("123456789"));
        Assert.Equal("••••", BankRefundService.Mask("1234"));
    }
}
