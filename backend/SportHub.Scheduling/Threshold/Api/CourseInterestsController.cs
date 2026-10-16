using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Threshold.Application;

namespace SportHub.Scheduling.Threshold.Api;

[ApiController]
public sealed class CourseInterestsController(CourseInterestService interests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("api/members/me/course-interests")]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await interests.ListAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpDelete("api/members/me/course-interests/{id:guid}")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    { await interests.CancelAsync(id, User.RequireUserId(), ct); return NoContent(); }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("api/manager/course-interests")]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await interests.ListAsync(null, ct));
}
