using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

[ApiController, Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/classes/{classId:int}/schedule")]
public sealed class ClassScheduleController(IClassSessionService sessions) : ControllerBase
{
    [HttpPost("preview")]
    public async Task<IActionResult> Preview(int classId, ChangeClassScheduleRequest request, CancellationToken ct)
        => Ok(await sessions.ChangeScheduleAsync(classId, request, User.RequireUserId(), true, ct));

    [HttpPost]
    public async Task<IActionResult> Change(int classId, ChangeClassScheduleRequest request, CancellationToken ct)
        => Ok(await sessions.ChangeScheduleAsync(classId, request, User.RequireUserId(), false, ct));
}
