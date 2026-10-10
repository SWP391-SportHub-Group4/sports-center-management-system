using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Threshold.Application;

namespace SportHub.Scheduling.Threshold.Api;

[ApiController]
[Authorize]
public sealed class CourseInterestsController(CourseInterestService interests) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("api/members/me/course-interests")]
    public async Task<IActionResult> Mine([FromQuery] int? sportId, [FromQuery] bool? active,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await interests.SearchAsync(User.RequireUserId(), sportId, active, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("api/members/me/course-interests/{id:guid}/unsubscribe")]
    public async Task<IActionResult> Unsubscribe(Guid id, CancellationToken ct)
    {
        await interests.UnsubscribeAsync(id, User.RequireUserId(), ct);
        return NoContent();
    }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("api/manager/course-interests")]
    public async Task<IActionResult> Manager([FromQuery] int? sportId, [FromQuery] bool? active,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await interests.SearchAsync(null, sportId, active, page, pageSize, ct));
}
