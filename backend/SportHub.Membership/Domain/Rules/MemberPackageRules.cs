using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Domain.Rules;

/// <summary>Membership grants access by active status and inclusive Vietnam dates; it has no session quota.</summary>
public static class MemberPackageRules
{
    public static bool IsUsable(MemberPackage package, DateOnly todayLocal, DateTime? nowUtc = null)
        => package.Status == MemberPackageStatus.Active
           && package.StartDate <= todayLocal && todayLocal <= package.EndDate
           && (package.ExpiresAtUtc is null || nowUtc is null || package.ExpiresAtUtc > nowUtc);

    public static bool ShouldExpire(MemberPackage package, DateOnly todayLocal, DateTime? nowUtc = null)
        => package.Status == MemberPackageStatus.Active
           && (todayLocal > package.EndDate
               || (package.ExpiresAtUtc is not null && nowUtc is not null && package.ExpiresAtUtc <= nowUtc));

    /// <summary>Gói bán theo tháng (BR-9) lưu thời hạn bằng số ngày danh nghĩa 30/90/180/365; quy ra 1/3/6/12 tháng.</summary>
    public static int DurationMonths(int durationDays)
        => durationDays >= 28 ? (int)Math.Round(durationDays / 30.4375, MidpointRounding.AwayFromZero) : 0;

    /// <summary>BR-9: EndDate = StartDate.AddMonths(DurationInMonths).AddDays(-1), cả hai đầu đều inclusive. Gói dưới một tháng (legacy) tính theo ngày.</summary>
    public static (DateOnly StartDate, DateOnly EndDate) ComputePeriod(DateOnly startLocal, int durationDays)
    {
        var months = DurationMonths(durationDays);
        return months > 0
            ? (startLocal, startLocal.AddMonths(months).AddDays(-1))
            : (startLocal, startLocal.AddDays(Math.Max(durationDays, 1) - 1));
    }

    /// <summary>BR-65: gia hạn sớm bắt đầu ngay sau EndDate của Membership còn hiệu lực; đã hết hạn hoặc chưa có thì bắt đầu hôm nay.</summary>
    public static DateOnly RenewalStart(DateOnly todayLocal, DateOnly? latestActiveEnd)
        => latestActiveEnd is { } end && end >= todayLocal ? end.AddDays(1) : todayLocal;

    public static DateOnly Today(IClock clock) => VietnamTime.TodayLocal(clock);
}