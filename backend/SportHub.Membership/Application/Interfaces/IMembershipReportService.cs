using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Interfaces;

public interface IMembershipReportService
{
    Task<MembershipPeriodResponse> GetPeriodAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default);
    Task<MembershipSummaryResponse> GetSummaryAsync(
        DateOnly asOfDate,
        CancellationToken ct = default);
}
