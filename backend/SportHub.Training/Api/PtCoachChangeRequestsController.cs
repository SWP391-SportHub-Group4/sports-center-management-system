using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>BR-74/75 — Member xin đổi PersonalTrainer; Center Manager duyệt hoặc từ chối.</summary>
[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public sealed class PtCoachChangeRequestsController(IPtCoachChangeRequestService changeRequests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-coach-change-requests")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await changeRequests.MineAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-coach-change-requests")]
    [ProducesResponseType<IReadOnlyList<PtCoachChangeRequestResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtCoachChangeRequestService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await changeRequests.SearchAsync(status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-coach-change-requests/{requestId:guid}/approve")]
    [ProducesResponseType<PtCoachChangeApprovalResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Approve(
        Guid requestId,
        [FromBody] ReviewPtCoachChangeRequest request,
        CancellationToken ct)
        => Ok(await changeRequests.ApproveAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-coach-change-requests/{requestId:guid}/reject")]
    [ProducesResponseType<PtCoachChangeRequestResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Reject(
        Guid requestId,
        [FromBody] ReviewPtCoachChangeRequest request,
        CancellationToken ct)
        => Ok(await changeRequests.RejectAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("members/me/pt-entitlements/{entitlementId:guid}/coach-change-requests")]
    [ProducesResponseType<PtCoachChangeRequestResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> RequestChange(
        Guid entitlementId,
        [FromBody] RequestPtCoachChangeRequest request,
        CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created,
            await changeRequests.RequestAsync(entitlementId, request, User.RequireUserId(), ct));
}
