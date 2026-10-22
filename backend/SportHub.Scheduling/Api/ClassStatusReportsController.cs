using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;

namespace SportHub.Scheduling.Api;

public sealed record ClassStatusReport(int Open, int Completed, int Unpublished);

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports/class-status")]
public sealed class ClassStatusReportsController(ISportHubDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ClassStatusReport>> Get(CancellationToken ct)
    {
        var counts = await db.Set<Class>().AsNoTracking()
            .Where(c => c.Status != ClassStatus.Cancelled)
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        return Ok(new ClassStatusReport(
            counts.GetValueOrDefault(ClassStatus.Published) + counts.GetValueOrDefault(ClassStatus.InProgress),
            counts.GetValueOrDefault(ClassStatus.Completed),
            counts.GetValueOrDefault(ClassStatus.Draft)));
    }
}
