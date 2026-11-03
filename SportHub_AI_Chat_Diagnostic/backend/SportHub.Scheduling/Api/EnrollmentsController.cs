using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

/// <summary>
/// Chỉ đọc: ghi danh của Member và lịch học của Member. Không có POST ghi danh hay hủy — ghi danh chỉ sinh từ thanh toán thành công.
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
public class EnrollmentsController(
    IEnrollmentService enrollments,
    IClassSessionService sessions,
    IClock clock) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/enrollments")]
    public async Task<IActionResult> MyEnrollments([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await enrollments.ListForMemberAsync(User.RequireUserId(), page, pageSize, ct));

    /// <summary>Lịch học sắp tới; mặc định từ bây giờ đến 30 ngày tới.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/schedule")]
    public async Task<IActionResult> MySchedule([FromQuery] DateTime? fromUtc, [FromQuery] DateTime? toUtc, CancellationToken ct)
    {
        var from = fromUtc ?? clock.UtcNow;
        return Ok(await sessions.GetMemberScheduleAsync(User.RequireUserId(), from, toUtc ?? from.AddDays(30), ct));
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("members/{memberId:guid}/enrollments")]
    public async Task<IActionResult> MemberEnrollments(
        Guid memberId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await enrollments.ListForMemberAsync(memberId, page, pageSize, ct));
}
