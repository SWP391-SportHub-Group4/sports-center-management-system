using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Rental.Api;

[ApiController]
public sealed class CourtScheduleController(CourtScheduleService schedule) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("api/manager/court-schedule")]
    public async Task<IActionResult> Staff([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate,
        [FromQuery] int? roomId, CancellationToken ct)
        => Ok(await schedule.GetAsync(fromDate, toDate, roomId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("api/coaches/me/court-schedule")]
    public async Task<IActionResult> Mine([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate,
        [FromQuery] int? roomId, CancellationToken ct)
        => Ok(await schedule.GetAsync(fromDate, toDate, roomId, User.RequireUserId(), ct));
}
