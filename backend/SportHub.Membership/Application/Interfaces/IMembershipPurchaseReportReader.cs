namespace SportHub.Membership.Application.Interfaces;

public interface IMembershipPurchaseReportReader
{
    Task<int> CountMembersAsync(DateTime fromUtc, DateTime toUtcExclusive, CancellationToken ct = default);
}
