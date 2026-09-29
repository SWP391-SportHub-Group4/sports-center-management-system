using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Api;

/// <summary>
/// Buổi PT — Manager tạo/cancel/reschedule; PersonalTrainer chỉ xem lịch của mình và ghi
/// complete/no-show; Member chỉ xem lịch của mình (gửi đổi lịch qua
/// <see cref="PtSessionChangeRequestsController"/>).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
public class PtSessionsController(IPtSessionService sessions, ICoachProfileReader coachProfiles) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-sessions")]
    public async Task<IActionResult> ManagerSearch(
        [FromQuery] Guid? memberId,
        [FromQuery] Guid? coachId,
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        CancellationToken ct)
        => Ok(await sessions.SearchAsync(memberId, coachId, status, fromUtc, toUtc, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions")]
    public async Task<IActionResult> Create([FromBody] CreatePtSessionRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await sessions.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions/{sessionId:guid}/cancel")]
    public async Task<IActionResult> ManagerCancel(
        Guid sessionId, [FromBody] ManagerCancelPtSessionRequest request, CancellationToken ct)
        => Ok(await sessions.ManagerCancelAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-sessions/{sessionId:guid}/reschedule")]
    public async Task<IActionResult> ManagerReschedule(
        Guid sessionId, [FromBody] ManagerReschedulePtSessionRequest request, CancellationToken ct)
        => Ok(await sessions.ManagerRescheduleAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/pt-sessions")]
    public async Task<IActionResult> CoachSearch(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await coachProfiles.RequireCategoryAsync(coachId, CoachCategory.PersonalTrainer, ct);

        return Ok(await sessions.SearchAsync(memberId: null, coachId, status, fromUtc, toUtc, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/pt-sessions/{sessionId:guid}")]
    public async Task<IActionResult> CoachGet(Guid sessionId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await coachProfiles.RequireCategoryAsync(coachId, CoachCategory.PersonalTrainer, ct);

        var session = await sessions.GetAsync(sessionId, ct);

        if (session.CoachId != coachId)
        {
            return Forbid();
        }

        return Ok(session);
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/pt-sessions/{sessionId:guid}/complete")]
    public async Task<IActionResult> Complete(Guid sessionId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await coachProfiles.RequireCategoryAsync(coachId, CoachCategory.PersonalTrainer, ct);

        return Ok(await sessions.CompleteAsync(sessionId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/pt-sessions/{sessionId:guid}/no-show")]
    public async Task<IActionResult> NoShow(
        Guid sessionId, [FromBody] NoShowPtSessionRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await coachProfiles.RequireCategoryAsync(coachId, CoachCategory.PersonalTrainer, ct);

        return Ok(await sessions.NoShowAsync(sessionId, request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-sessions")]
    public async Task<IActionResult> MemberSearch(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        CancellationToken ct)
        => Ok(await sessions.SearchAsync(User.RequireUserId(), coachId: null, status, fromUtc, toUtc, ct));
}
