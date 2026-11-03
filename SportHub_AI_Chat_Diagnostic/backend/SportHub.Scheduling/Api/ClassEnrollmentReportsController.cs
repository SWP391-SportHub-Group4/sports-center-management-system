using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

/// <summary>Báo cáo sĩ số khóa học. Canonical: <c>/api/reports/class-enrollment</c>; <c>/class-utilization</c> giữ chuyển tiếp (deprecated).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports")]
public sealed class ClassEnrollmentReportsController(IClassEnrollmentReportService reports, IClock clock) : ControllerBase
{
    [HttpGet("class-enrollment")]
    [ProducesResponseType<ClassEnrollmentReportResponse>(StatusCodes.Status200OK)]
    public Task<ActionResult<ClassEnrollmentReportResponse>> Get(
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, [FromQuery] int? sportId, CancellationToken ct = default)
        => RunAsync(fromDate, toDate, sportId, ct);

    /// <summary>DEPRECATED: dùng <c>class-enrollment</c>. Cùng dữ liệu, thêm header <c>Deprecation</c>.</summary>
    [HttpGet("class-utilization")]
    [ProducesResponseType<ClassEnrollmentReportResponse>(StatusCodes.Status200OK)]
    public Task<ActionResult<ClassEnrollmentReportResponse>> GetDeprecated(
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, [FromQuery] int? sportId, CancellationToken ct = default)
    {
        Response.Headers["Deprecation"] = "true";
        Response.Headers["Link"] = "</api/reports/class-enrollment>; rel=\"successor-version\"";
        return RunAsync(fromDate, toDate, sportId, ct);
    }

    private async Task<ActionResult<ClassEnrollmentReportResponse>> RunAsync(
        DateOnly? fromDate, DateOnly? toDate, int? sportId, CancellationToken ct)
    {
        var to = toDate ?? VietnamTime.TodayLocal(clock);
        var from = fromDate ?? to.AddDays(-30);

        return Ok(await reports.GetAsync(from, to, sportId, ct));
    }
}
