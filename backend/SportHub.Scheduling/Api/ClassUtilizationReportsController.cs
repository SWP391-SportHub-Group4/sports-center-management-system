using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports")]
public sealed class ClassUtilizationReportsController(
    IClassUtilizationReportService reports,
    IClock clock) : ControllerBase
{
    [HttpGet("class-utilization")]
    [ProducesResponseType<ClassUtilizationReportResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ClassUtilizationReportResponse>> Get(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] string? discipline,
        CancellationToken ct = default)
    {
        var to = toDate ?? VietnamTime.TodayLocal(clock);
        var from = fromDate ?? to.AddDays(-29);

        return Ok(await reports.GetAsync(from, to, discipline, ct));
    }
}
