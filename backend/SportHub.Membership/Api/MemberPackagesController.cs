using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Application.Services;

namespace SportHub.Membership.Api;

/// <summary>
/// Gói đã bán cho hội viên. Endpoint mua gói nằm ở module Payment (BR-30 — hoá đơn và gói
/// phải sinh cùng transaction).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
public class MemberPackagesController(IMemberPackageService memberPackages, ICoachMemberAccessReader coachAccess) : ControllerBase
{
    /// <summary>Self action — memberId lấy từ JWT, không nhận từ route.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/packages")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
        => Ok(await memberPackages.GetByMemberAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("members/{memberId:guid}/packages")]
    public async Task<IActionResult> GetByMember(Guid memberId, CancellationToken ct)
    {
        if (User.IsInRole(nameof(UserRole.Coach)) &&
            !await coachAccess.HasActiveRelationshipAsync(User.RequireUserId(), memberId, ct))
            return Forbid();

        return Ok(await memberPackages.GetByMemberAsync(memberId, ct));
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("member-packages")]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] string? keyword,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default, [FromQuery] int? packageId = null)
        => Ok(await memberPackages.SearchAsync(status, keyword, page, pageSize, ct, packageId));
}
