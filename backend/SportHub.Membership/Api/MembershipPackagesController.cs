using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Membership.Application.Commands;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Application.Services;

namespace SportHub.Membership.Api;

/// <summary>
/// Danh mục gói thành viên. Đọc: mọi người đã đăng nhập (hội viên cần xem để chọn mua).
/// Ghi: chỉ Center Manager (BR-8, BR-39).
/// </summary>
[ApiController]
[Authorize]
[Route("api/membership-packages")]
public class MembershipPackagesController(IMembershipPackageService packages) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        var allowInactive = includeInactive && User.IsInRole(SportHubRoleNames.CenterManager);

        return Ok(await packages.GetAllAsync(allowInactive, ct));
    }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveMembershipPackageRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await packages.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{packageId:int}")]
    public async Task<IActionResult> Update(int packageId, [FromBody] SaveMembershipPackageRequest request, CancellationToken ct)
        => Ok(await packages.UpdateAsync(packageId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{packageId:int}/discontinue")]
    public async Task<IActionResult> Discontinue(int packageId, CancellationToken ct)
        => Ok(await packages.SetActiveAsync(packageId, isActive: false, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{packageId:int}/reactivate")]
    public async Task<IActionResult> Reactivate(int packageId, CancellationToken ct)
        => Ok(await packages.SetActiveAsync(packageId, isActive: true, User.RequireUserId(), ct));
}
