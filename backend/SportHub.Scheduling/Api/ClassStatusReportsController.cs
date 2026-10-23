using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Api;

public sealed record ClassStatusReport(int Open, int Completed, int Unpublished)
{
    public IReadOnlyList<ClassStatusRow> Classes { get; init; } = [];
}
public sealed record ClassStatusRow(int ClassId, string Name, int SportId, string SportName, DateOnly StartDate,
    [property: WireEnum] string Status, int Capacity, int ConfirmedCount, [property: WireEnum] string ThresholdStatus);

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports/class-status")]
public sealed class ClassStatusReportsController(ISportHubDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ClassStatusReport>> Get([FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate, [FromQuery] int? sportId, CancellationToken ct)
    {
        if (fromDate.HasValue != toDate.HasValue || fromDate is DateOnly start && toDate is DateOnly end && (end < start || end.DayNumber - start.DayNumber >= 366))
            throw new BadRequestException("invalid_date_range", "Provide both dates, no more than 366 days apart.");
        return Ok(await ClassStatusReportReader.ReadAsync(db, fromDate, toDate, sportId, ct));
    }
}

public static class ClassStatusReportReader
{
    public static async Task<ClassStatusReport> ReadAsync(ISportHubDbContext db, DateOnly? fromDate,
        DateOnly? toDate, int? sportId, CancellationToken ct)
    {
        var rows = await db.Set<Class>().AsNoTracking()
            .Where(c => c.Status != ClassStatus.Cancelled && (!fromDate.HasValue || c.StartDate >= fromDate)
                && (!toDate.HasValue || c.StartDate <= toDate) && (!sportId.HasValue || c.SportId == sportId))
            .OrderBy(c => c.StartDate).ThenBy(c => c.ClassId)
            .Select(c => new ClassStatusRow(c.ClassId, c.Name, c.SportId, c.Sport!.Name, c.StartDate,
                c.Status.ToString(), c.Capacity, c.ConfirmedCount, c.ThresholdStatus.ToString())).ToListAsync(ct);
        return new(rows.Count(c => c.Status is "Published" or "InProgress"), rows.Count(c => c.Status == "Completed"), rows.Count(c => c.Status == "Draft"))
        { Classes = rows };
    }
}
