using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Training.Domain.Rules;

/// <summary>
/// BR-71 — TotalQuota = 4/8/12 (theo FrequencyPerWeek 1/2/3) × số tháng Membership. Số tháng suy
/// ra bằng cách đối chiếu StartDate/EndDate với 1/3/6/12 tháng — MembershipPackage hiện lưu
/// DurationDays, không có DurationInMonths, nên đây là helper duy nhất tái tạo lại số tháng.
/// </summary>
public static class PtEntitlementRules
{
    private static readonly int[] AllowedMonths = [1, 3, 6, 12];

    public static int InferDurationMonths(DateOnly startDate, DateOnly endDate)
    {
        foreach (var months in AllowedMonths)
        {
            if (endDate == startDate.AddMonths(months).AddDays(-1))
            {
                return months;
            }
        }

        throw new BadRequestException(
            "pt_entitlement_invalid_membership_duration",
            "Membership gốc phải có thời hạn 1, 3, 6 hoặc 12 tháng để tính quota PT (BR-71).");
    }

    public static int SessionsPerMonth(int frequencyPerWeek) => frequencyPerWeek switch
    {
        1 => 4,
        2 => 8,
        3 => 12,
        _ => throw new BadRequestException(
            "pt_entitlement_invalid_frequency", "FrequencyPerWeek chỉ nhận 1, 2 hoặc 3.")
    };

    public static int ComputeTotalQuota(int frequencyPerWeek, DateOnly startDate, DateOnly endDate)
        => SessionsPerMonth(frequencyPerWeek) * InferDurationMonths(startDate, endDate);
}
