using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>
/// Buổi PT — Manager tạo/cancel/reschedule; PersonalTrainer chỉ xem lịch của mình và ghi
/// complete/no-show; Member chỉ xem lịch của mình (gửi đổi lịch qua
/// <see cref="PtSessionChangeRequestsController"/>).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public class PtSessionsController(IPtSessionService sessions, PersonalTrainerGuard personalTrainers) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-sessions")]
    [ProducesResponseType<IReadOnlyList<PtSessionResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ManagerSearch(
        [FromQuery] Guid? memberId,
        [FromQuery] Guid? coachId,
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtSessionService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await sessions.SearchAsync(memberId, coachId, status, fromUtc, toUtc, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreatePtSessionRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await sessions.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions/{sessionId:guid}/cancel")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ManagerCancel(
        Guid sessionId, [FromBody] ManagerCancelPtSessionRequest request, CancellationToken ct)
        => Ok(await sessions.ManagerCancelAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions/{sessionId:guid}/reschedule")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ManagerReschedule(
        Guid sessionId, [FromBody] ManagerReschedulePtSessionRequest request, CancellationToken ct)
        => Ok(await sessions.ManagerRescheduleAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/pt-sessions")]
    [ProducesResponseType<IReadOnlyList<PtSessionResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> CoachSearch(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtSessionService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        return Ok(await sessions.SearchAsync(memberId: null, coachId, status, fromUtc, toUtc, page, pageSize, ct,
            activeRelationshipOnly: true));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/pt-sessions/{sessionId:guid}")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> CoachGet(Guid sessionId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        return Ok(await sessions.GetForCoachAsync(sessionId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/pt-sessions/{sessionId:guid}/complete")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Complete(Guid sessionId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return Ok(await sessions.CompleteAsync(sessionId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/pt-sessions/{sessionId:guid}/no-show")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> NoShow(
        Guid sessionId, [FromBody] NoShowPtSessionRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return Ok(await sessions.NoShowAsync(sessionId, request, coachId, ct));
    }

    /// <summary>
    /// Khung PT còn trống của Coach được giao (G05). Ngày theo giờ Việt Nam; mặc định 7 ngày từ hôm nay, tối đa 14 ngày.
    /// Chỉ là gợi ý: đặt lịch vẫn kiểm lại trong transaction.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-entitlements/{entitlementId:guid}/availability")]
    [ProducesResponseType<PtAvailabilityResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> MemberAvailability(
        Guid entitlementId,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromServices] SportHub.BuildingBlocks.SharedKernel.Time.IClock clock,
        CancellationToken ct = default)
    {
        var from = fromDate ?? SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.TodayLocal(clock);
        var to = toDate ?? from.AddDays(6);

        return Ok(await sessions.GetSelfBookingAvailabilityAsync(User.RequireUserId(), entitlementId, from, to, ct));
    }

    /// <summary>Member tự đặt buổi PT bằng quyền lợi của mình. 409 khi hết quota, trùng giờ hoặc khung không còn trống.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("members/me/pt-sessions")]
    [ProducesResponseType<PtSessionResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> MemberBook([FromBody] SelfBookPtSessionRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sessions.SelfBookAsync(User.RequireUserId(), request, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-sessions")]
    [ProducesResponseType<IReadOnlyList<PtSessionResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> MemberSearch(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtSessionService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await sessions.SearchAsync(
            User.RequireUserId(), coachId: null, status, fromUtc, toUtc, page, pageSize, ct));
}
