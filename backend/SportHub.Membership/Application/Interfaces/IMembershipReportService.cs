using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Interfaces;

public interface IMembershipReportService
{
    Task<MembershipSummaryResponse> GetSummaryAsync(
        DateOnly asOfDate,
        CancellationToken ct = default);
}
