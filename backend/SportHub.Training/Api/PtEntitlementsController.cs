using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Api;

/// <summary>Quyền lợi PT — Manager xem toàn bộ, Member chỉ xem của chính mình. Tạo/kích hoạt/hủy
/// thuộc IPtEntitlementLifecycle (Payment gọi nội bộ), không có endpoint ghi ở đây.</summary>
[ApiController]
[Authorize]
[Route("api")]
public class PtEntitlementsController(IPtEntitlementQueryService entitlements) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-entitlements")]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? memberId, [FromQuery] Guid? coachId, [FromQuery] string? status, CancellationToken ct)
        => Ok(await entitlements.SearchAsync(memberId, coachId, status, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-entitlements")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
        => Ok(await entitlements.SearchAsync(User.RequireUserId(), coachId: null, status: null, ct));
}
