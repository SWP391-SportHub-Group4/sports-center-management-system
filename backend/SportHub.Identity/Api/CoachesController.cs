using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

/// <summary>Manager quản lý Coach nội bộ và chuyên môn theo môn (BR-96). Role luôn là Coach, không nhận từ body.</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CoachManagement)]
[Route("api/manager/coaches")]
public class CoachesController(CoachAdminService coaches) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? keyword,
        [FromQuery] int? sportId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await coaches.SearchAsync(keyword, sportId, page, pageSize, ct));

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct) => Ok(await coaches.GetAsync(userId, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCoachRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await coaches.CreateAsync(request, User.RequireUserId(), ct));

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> Update(Guid userId, [FromBody] UpdateCoachRequest request, CancellationToken ct)
        => Ok(await coaches.UpdateAsync(userId, request, User.RequireUserId(), ct));
}
