namespace SportHub.Membership.Application.Interfaces;

public interface IMembershipPurchaseReportReader
{
    Task<int> CountMembersAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default);
    Task<IReadOnlyList<MembershipPurchaseDay>> ReadDailyAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default);
    Task<int> CountDayPassesAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default);
}
public sealed record MembershipPurchaseDay(DateOnly Date, int Buyers, int DayPassesSold = 0);
