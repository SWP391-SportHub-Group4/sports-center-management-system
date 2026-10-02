using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Api;

[ApiController]
public sealed class OperationsReadController(ISportHubDbContext db) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk), HttpGet("api/gym-checkins/inside")]
    public async Task<IActionResult> Inside([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<GymCheckIn>().AsNoTracking().Where(x => x.CheckOutTime == null);
        var count = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.CheckInTime).ThenBy(x => x.CheckInId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new GymInsideRow(x.CheckInId, x.MemberId,
                x.Member!.Profile != null ? x.Member.Profile.FullName : x.Member.Email, x.CheckInTime)).ToListAsync(ct);
        return Ok(new PagedResult<GymInsideRow> { Items = rows, TotalCount = count, Page = page, PageSize = pageSize });
    }

    [Authorize(Policy = SportHubPolicies.CenterManager), HttpGet("api/manager/classes/{classId:int}/holds")]
    public async Task<IActionResult> Holds(int classId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        await RequireClassAsync(classId, ct);
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from h in db.Set<SeatHold>().AsNoTracking()
                    join u in db.Set<UserAccount>().AsNoTracking() on h.MemberId equals u.UserId
                    where h.ClassId == classId
                    select new { Hold = h, Name = u.Profile != null ? u.Profile.FullName : u.Email };
        return Ok(new PagedResult<CourseHoldRow> { Items = await query.OrderByDescending(x => x.Hold.CreatedAt).ThenBy(x => x.Hold.HoldId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => new CourseHoldRow(x.Hold.HoldId, x.Hold.MemberId, x.Name,
                x.Hold.InvoiceId, x.Hold.Status.ToString(), x.Hold.ExpiresAtUtc, x.Hold.CreatedAt)).ToListAsync(ct),
            TotalCount = await query.CountAsync(ct), Page = page, PageSize = pageSize });
    }

    [Authorize(Policy = SportHubPolicies.CenterManager), HttpGet("api/manager/classes/{classId:int}/enrollments")]
    public async Task<IActionResult> Enrollments(int classId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        await RequireClassAsync(classId, ct);
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from e in db.Set<Enrollment>().AsNoTracking()
                    join u in db.Set<UserAccount>().AsNoTracking() on e.MemberId equals u.UserId
                    where e.ClassId == classId
                    select new { Enrollment = e, Name = u.Profile != null ? u.Profile.FullName : u.Email };
        return Ok(new PagedResult<CourseEnrollmentRow> { Items = await query.OrderByDescending(x => x.Enrollment.EnrolledAt).ThenBy(x => x.Enrollment.EnrollmentId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => new CourseEnrollmentRow(x.Enrollment.EnrollmentId, x.Enrollment.MemberId, x.Name,
                x.Enrollment.InvoiceItemId, x.Enrollment.Status.ToString(), x.Enrollment.EnrolledAt)).ToListAsync(ct),
            TotalCount = await query.CountAsync(ct), Page = page, PageSize = pageSize });
    }

    [Authorize(Policy = SportHubPolicies.CenterManager), HttpGet("api/manager/classes/{classId:int}/threshold-responses")]
    public async Task<IActionResult> Responses(int classId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        await RequireClassAsync(classId, ct);
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from r in db.Set<ThresholdResponse>().AsNoTracking()
                    join u in db.Set<UserAccount>().AsNoTracking() on r.MemberId equals u.UserId
                    where r.ClassId == classId
                    select new { Response = r, Name = u.Profile != null ? u.Profile.FullName : u.Email };
        return Ok(new PagedResult<CourseThresholdRow> { Items = await query.OrderBy(x => x.Response.DeadlineUtc).ThenBy(x => x.Response.ThresholdResponseId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => new CourseThresholdRow(x.Response.ThresholdResponseId, x.Response.MemberId, x.Name,
                x.Response.Choice != null ? x.Response.Choice.ToString() : null, x.Response.TargetClassId, x.Response.ResolutionStatus.ToString(),
                x.Response.AdditionalInvoiceId, x.Response.DeadlineUtc)).ToListAsync(ct), TotalCount = await query.CountAsync(ct), Page = page, PageSize = pageSize });
    }

    private async Task RequireClassAsync(int id, CancellationToken ct)
    {
        if (!await db.Set<Class>().AnyAsync(x => x.ClassId == id, ct))
            throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");
    }
}
public sealed record GymInsideRow(Guid CheckInId, Guid MemberId, string MemberName, DateTime CheckInTime);
public sealed record CourseHoldRow(Guid HoldId, Guid MemberId, string MemberName, Guid? InvoiceId,
    [property: WireEnum] string Status, DateTime ExpiresAtUtc, DateTime CreatedAt);
public sealed record CourseEnrollmentRow(Guid EnrollmentId, Guid MemberId, string MemberName, Guid? InvoiceItemId,
    [property: WireEnum] string Status, DateTime EnrolledAt);
public sealed record CourseThresholdRow(Guid ResponseId, Guid MemberId, string MemberName, [property: WireEnum] string? Choice,
    int? TargetClassId, [property: WireEnum] string ResolutionStatus, Guid? AdditionalInvoiceId, DateTime DeadlineUtc);
