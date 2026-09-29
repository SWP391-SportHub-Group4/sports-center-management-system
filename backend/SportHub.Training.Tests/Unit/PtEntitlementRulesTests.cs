using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Tests.Unit;

public sealed class PtEntitlementRulesTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(6)]
    [InlineData(12)]
    public void InferDurationMonths_accepts_the_four_official_durations(int months)
    {
        var start = new DateOnly(2026, 1, 15);
        var end = start.AddMonths(months).AddDays(-1);

        Assert.Equal(months, PtEntitlementRules.InferDurationMonths(start, end));
    }

    [Theory]
    [InlineData(30)]
    [InlineData(90)]
    [InlineData(120)]
    [InlineData(14)]
    public void InferDurationMonths_rejects_fixed_day_durations(int days)
    {
        // Neo vao 01/02: bat dau tu 15/01 se lam 90 ngay trung dung Jan+Feb+Mar (28 ngay, nam
        // khong nhuan) = 90 ngay, khien test nay sai duong (khong con la phan bi tu choi nua).
        // Doi mo neo sang 01/02 de cac gia tri test thuc su khong trung ngau nhien voi 1/3/6/12 thang.
        var start = new DateOnly(2026, 2, 1);
        var end = start.AddDays(days - 1);

        var ex = Assert.Throws<BadRequestException>(() => PtEntitlementRules.InferDurationMonths(start, end));
        Assert.Equal("pt_entitlement_invalid_membership_duration", ex.ErrorCode);
    }

    [Theory]
    [InlineData(1, 4)]
    [InlineData(2, 8)]
    [InlineData(3, 12)]
    public void SessionsPerMonth_matches_br71_table(int frequencyPerWeek, int expectedSessionsPerMonth)
    {
        Assert.Equal(expectedSessionsPerMonth, PtEntitlementRules.SessionsPerMonth(frequencyPerWeek));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public void SessionsPerMonth_rejects_frequency_outside_one_two_three(int frequencyPerWeek)
    {
        var ex = Assert.Throws<BadRequestException>(() => PtEntitlementRules.SessionsPerMonth(frequencyPerWeek));
        Assert.Equal("pt_entitlement_invalid_frequency", ex.ErrorCode);
    }

    [Fact]
    public void ComputeTotalQuota_multiplies_sessions_per_month_by_duration()
    {
        var start = new DateOnly(2026, 1, 1);
        var end = start.AddMonths(3).AddDays(-1);

        Assert.Equal(24, PtEntitlementRules.ComputeTotalQuota(2, start, end));
    }
}
