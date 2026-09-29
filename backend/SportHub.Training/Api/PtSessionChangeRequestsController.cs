using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Api;

/// <summary>Member xin Cancel/Reschedule buổi PT; Manager duyệt/từ chối.</summary>
[ApiController]
[Authorize]
[Route("api")]
public class PtSessionChangeRequestsController(IPtSessionChangeRequestService changeRequests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-session-change-requests")]
    public async Task<IActionResult> Search([FromQuery] string? status, CancellationToken ct)
        => Ok(await changeRequests.SearchAsync(status, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-session-change-requests/{requestId:guid}/approve")]
    public async Task<IActionResult> Approve(
        Guid requestId, [FromBody] ReviewPtSessionChangeRequest request, CancellationToken ct)
        => Ok(await changeRequests.ApproveAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("manager/pt-session-change-requests/{requestId:guid}/reject")]
    public async Task<IActionResult> Reject(
        Guid requestId, [FromBody] ReviewPtSessionChangeRequest request, CancellationToken ct)
        => Ok(await changeRequests.RejectAsync(requestId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("members/me/pt-sessions/{sessionId:guid}/change-requests")]
    public async Task<IActionResult> RequestChange(
        Guid sessionId, [FromBody] RequestPtSessionChangeRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created,
            await changeRequests.RequestAsync(sessionId, request, User.RequireUserId(), ct));
}
