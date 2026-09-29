using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Môn thể thao (BR-106/107). Công khai chỉ đọc môn đang hoạt động; Manager ghi.</summary>
[ApiController]
public class SportsController(SportCatalogService sports) : ControllerBase
{
    /// <summary>Landing page: danh sách môn đang hoạt động, không cần đăng nhập.</summary>
    [AllowAnonymous]
    [HttpGet("api/sports")]
    public async Task<IActionResult> ListActive(CancellationToken ct) => Ok(await sports.ListAsync(includeInactive: false, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpGet("api/manager/sports")]
    public async Task<IActionResult> ListAll(CancellationToken ct) => Ok(await sports.ListAsync(includeInactive: true, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports")]
    public async Task<IActionResult> Create([FromBody] SaveSportRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sports.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/sports/{sportId:int}")]
    public async Task<IActionResult> Update(int sportId, [FromBody] SaveSportRequest request, CancellationToken ct)
        => Ok(await sports.UpdateAsync(sportId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/deactivate")]
    public async Task<IActionResult> Deactivate(int sportId, CancellationToken ct)
        => Ok(await sports.DeactivateAsync(sportId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/activate")]
    public async Task<IActionResult> Activate(int sportId, CancellationToken ct)
        => Ok(await sports.ActivateAsync(sportId, User.RequireUserId(), ct));
}
