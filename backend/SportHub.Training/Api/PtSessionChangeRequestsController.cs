using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>Member xin Cancel/Reschedule buổi PT; Manager duyệt/từ chối.</summary>
[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public class PtSessionChangeRequestsController(IPtSessionChangeRequestService changeRequests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-session-change-requests")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await changeRequests.MineAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-session-change-requests")]
    [ProducesResponseType<IReadOnlyList<PtSessionChangeRequestResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtSessionChangeRequestService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await changeRequests.SearchAsync(status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-session-change-requests/{requestId:guid}/approve")]
    [ProducesResponseType<PtSessionChangeRequestResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Approve(
        Guid requestId, [FromBody] ReviewPtSessionChangeRequest request, CancellationToken ct)
        => Ok(await changeRequests.ApproveAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-session-change-requests/{requestId:guid}/reject")]
    [ProducesResponseType<PtSessionChangeRequestResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Reject(
        Guid requestId, [FromBody] ReviewPtSessionChangeRequest request, CancellationToken ct)
        => Ok(await changeRequests.RejectAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("members/me/pt-sessions/{sessionId:guid}/change-requests")]
    [ProducesResponseType<PtSessionChangeRequestResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> RequestChange(
        Guid sessionId, [FromBody] RequestPtSessionChangeRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created,
            await changeRequests.RequestAsync(sessionId, request, User.RequireUserId(), ct));
}
