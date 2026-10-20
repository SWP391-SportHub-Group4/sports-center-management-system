using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Threshold.Domain;
using SportHub.Scheduling.Threshold.Application;

namespace SportHub.Scheduling.Threshold.Api;

[ApiController]
[Authorize(Roles = "Member,CenterManager")]
[Route("api/course-interests")]
public sealed class CourseInterestsController(ISportHubDbContext db, CourseInterestService interests) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] int? sportId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default, bool? active = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<CourseInterest>().AsNoTracking().AsQueryable();
        if (!User.IsInRole("CenterManager")) query = query.Where(x => x.MemberId == User.RequireUserId());
        if (active.HasValue) query = query.Where(x => x.Active == active.Value);
        if (sportId.HasValue) query = query.Where(x => x.SportId == sportId.Value);
        var totalCount = await query.CountAsync(ct);
        var items = await (from interest in query
                           join source in db.Set<Class>() on interest.SourceClassId equals source.ClassId
                           join member in db.Set<SportHub.Identity.Domain.Entities.UserAccount>() on interest.MemberId equals member.UserId
                           orderby interest.CreatedAtUtc descending, interest.InterestId
                           select new { CourseInterestId = interest.InterestId, interest.MemberId, interest.SportId,
                               MemberName = member.Profile != null ? member.Profile.FullName : member.Email,
                               SportName = source.Sport!.Name, interest.SourceClassId, SourceClassName = source.Name,
                               interest.RefundedPoints, interest.CreatedAtUtc, interest.CancelledAtUtc })
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Ok(new { items, totalCount, page, pageSize });
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = SportHubPolicies.Member)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        await interests.CancelAsync(id, memberId, ct);
        return NoContent();
    }
}

// Retain the published member/manager contracts used by the cohort history UI.
[ApiController]
public sealed class MemberCourseInterestsController(CourseInterestService interests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("api/members/me/course-interests")]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await interests.ListAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpDelete("api/members/me/course-interests/{id:guid}")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    { await interests.CancelAsync(id, User.RequireUserId(), ct); return NoContent(); }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("api/manager/course-interests")]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await interests.ListAsync(null, ct));
}
