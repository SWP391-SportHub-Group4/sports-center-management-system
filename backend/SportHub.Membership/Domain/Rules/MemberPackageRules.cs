using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Domain.Rules;

/// <summary>Membership grants access by active status and inclusive Vietnam dates; it has no session quota.</summary>
public static class MemberPackageRules
{
    public static bool IsUsable(MemberPackage package, DateOnly todayLocal)
        => package.Status == MemberPackageStatus.Active
           && package.StartDate <= todayLocal && todayLocal <= package.EndDate;

    public static bool ShouldExpire(MemberPackage package, DateOnly todayLocal)
        => package.Status == MemberPackageStatus.Active && todayLocal > package.EndDate;

    public static (DateOnly StartDate, DateOnly EndDate) ComputePeriod(DateOnly startLocal, int durationDays)
        => (startLocal, startLocal.AddDays(Math.Max(durationDays, 1) - 1));

    public static DateOnly Today(IClock clock) => VietnamTime.TodayLocal(clock);
}