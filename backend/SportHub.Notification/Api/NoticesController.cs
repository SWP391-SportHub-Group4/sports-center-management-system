using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Notification.Application.DTOs;
using SportHub.Notification.Application.Services;

namespace SportHub.Notification.Api;

[ApiController, Authorize(Policy = SportHubPolicies.CenterManager), Route("api/manager/notices")]
public sealed class NoticesController(ManualNoticeService notices) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Send([FromBody] ManualNoticeRequest request, CancellationToken ct)
        => Ok(new { noticeId = await notices.SendAsync(request, User.RequireUserId(), ct) });
}
