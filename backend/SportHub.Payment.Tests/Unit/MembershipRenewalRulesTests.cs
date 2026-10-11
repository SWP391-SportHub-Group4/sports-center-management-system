using SportHub.Membership.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class MembershipRenewalRulesTests
{
    [Theory]
    [InlineData(30, 1)]
    [InlineData(90, 3)]
    [InlineData(180, 6)]
    [InlineData(365, 12)]
    [InlineData(14, 0)]
    public void Nominal_days_map_to_calendar_months(int days, int months)
        => Assert.Equal(months, MemberPackageRules.DurationMonths(days));

    [Fact]
    public void Br9_end_date_is_start_plus_months_minus_one_day()
    {
        var (start, end) = MemberPackageRules.ComputePeriod(new DateOnly(2026, 10, 11), 90);
        Assert.Equal(new DateOnly(2026, 10, 11), start);
        Assert.Equal(new DateOnly(2027, 1, 10), end);
    }

    [Fact]
    public void Br65_early_renewal_starts_the_day_after_current_end()
    {
        var today = new DateOnly(2026, 10, 11);
        var start = MemberPackageRules.RenewalStart(today, new DateOnly(2026, 10, 23));
        Assert.Equal(new DateOnly(2026, 10, 24), start);
        Assert.Equal(new DateOnly(2027, 1, 23), MemberPackageRules.ComputePeriod(start, 90).EndDate);
    }

    [Fact]
    public void Early_renewal_month_end_clamps_to_last_day_of_month()
    {
        var start = MemberPackageRules.RenewalStart(new DateOnly(2026, 10, 11), new DateOnly(2026, 11, 30));
        Assert.Equal(new DateOnly(2026, 12, 1), start);
        Assert.Equal(new DateOnly(2027, 2, 28), MemberPackageRules.ComputePeriod(start, 90).EndDate);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2026-10-05")]
    public void Expired_or_missing_membership_renews_from_today(string? latestEnd)
    {
        var today = new DateOnly(2026, 10, 11);
        var end = latestEnd is null ? (DateOnly?)null : DateOnly.Parse(latestEnd);
        Assert.Equal(today, MemberPackageRules.RenewalStart(today, end));
    }

    [Fact]
    public void Membership_ending_today_still_chains_to_tomorrow()
    {
        var today = new DateOnly(2026, 10, 11);
        Assert.Equal(today.AddDays(1), MemberPackageRules.RenewalStart(today, today));
    }
}
