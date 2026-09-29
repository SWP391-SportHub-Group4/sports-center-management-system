using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>Quyền lợi PT — Manager xem toàn bộ, Member chỉ xem của chính mình. Tạo/kích hoạt/hủy
/// thuộc IPtEntitlementLifecycle (Payment gọi nội bộ), không có endpoint ghi ở đây.</summary>
[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public class PtEntitlementsController(IPtEntitlementQueryService entitlements) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("manager/pt-entitlements")]
    [ProducesResponseType<IReadOnlyList<PtEntitlementResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? memberId,
        [FromQuery] Guid? coachId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtEntitlementQueryService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await entitlements.SearchAsync(memberId, coachId, status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/pt-entitlements")]
    [ProducesResponseType<IReadOnlyList<PtEntitlementResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PtEntitlementQueryService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await entitlements.SearchAsync(
            User.RequireUserId(), coachId: null, status: null, page, pageSize, ct));
}
