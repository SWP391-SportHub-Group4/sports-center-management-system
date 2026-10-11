using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;

namespace SportHub.Membership.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports")]
public sealed class MembershipReportsController(
    IMembershipReportService reports,
    IClock clock) : ControllerBase
{
    [HttpGet("membership-period")]
    public async Task<ActionResult<MembershipPeriodResponse>> GetPeriod(
        [FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, CancellationToken ct = default)
        => Ok(await reports.GetPeriodAsync(fromDate, toDate, ct));

    [HttpGet("membership-summary")]
    [ProducesResponseType<MembershipSummaryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<MembershipSummaryResponse>> GetSummary(
        [FromQuery] DateOnly? asOfDate,
        CancellationToken ct = default)
        => Ok(await reports.GetSummaryAsync(asOfDate ?? VietnamTime.TodayLocal(clock), ct));
}
