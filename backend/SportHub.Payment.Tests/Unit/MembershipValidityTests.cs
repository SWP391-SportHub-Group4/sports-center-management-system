using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class MembershipValidityTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(10)]
    [InlineData(null)]
    public void Legacy_session_counts_do_not_limit_membership(int? remaining)
    {
        var today = new DateOnly(2026, 10, 1);
        var package = new MemberPackage { Status = MemberPackageStatus.Active,
            StartDate = today, EndDate = today.AddDays(29), RemainingSessions = remaining };
        Assert.True(MemberPackageRules.IsUsable(package, today));
        Assert.False(MemberPackageRules.ShouldExpire(package, today));
        Assert.True(MemberPackageRules.ShouldExpire(package, today.AddDays(30)));
        Assert.False(MemberPackageRules.IsUsable(package, today.AddDays(30)));
    }
}
