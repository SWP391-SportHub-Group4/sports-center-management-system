using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Api;

[ApiController]
[Authorize(Roles = "Member,CenterManager")]
[Route("api/course-interests")]
public sealed class CourseInterestsController(ISportHubDbContext db, IClock clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] int? sportId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<CourseInterest>().AsNoTracking().AsQueryable();
        if (!User.IsInRole("CenterManager")) query = query.Where(x => x.MemberId == User.RequireUserId());
        if (sportId.HasValue) query = query.Where(x => x.SportId == sportId.Value);
        var totalCount = await query.CountAsync(ct);
        var items = await (from interest in query
                           join source in db.Set<Class>() on interest.SourceClassId equals source.ClassId
                           join member in db.Set<SportHub.Identity.Domain.Entities.UserAccount>() on interest.MemberId equals member.UserId
                           orderby interest.CreatedAtUtc descending, interest.CourseInterestId
                           select new { interest.CourseInterestId, interest.MemberId, interest.SportId,
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
        if (!await db.Set<CourseInterest>().AnyAsync(x => x.CourseInterestId == id && x.MemberId == memberId, ct))
            throw new NotFoundException("course_interest_not_found", "Course interest not found.");
        await db.Set<CourseInterest>().Where(x => x.CourseInterestId == id && x.MemberId == memberId && x.CancelledAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CancelledAtUtc, clock.UtcNow), ct);
        return NoContent();
    }
}
