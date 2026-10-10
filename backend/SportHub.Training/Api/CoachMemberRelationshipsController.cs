using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>
/// Quan hệ huấn luyện. Tạo/kết thúc là quyền của Center Manager (quyết định C3 — CẦN DUYỆT,
/// BR không nói rõ); HLV và hội viên chỉ xem quan hệ của chính mình.
/// </summary>
[ApiController]
[Authorize]
[Route("api/coach-member-relationships")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public class CoachMemberRelationshipsController(ICoachMemberRelationshipService relationships) : ControllerBase
{
    [Authorize(Roles = SportHubRoleNames.Member + "," + SportHubRoleNames.Coach + "," + SportHubRoleNames.CenterManager)]
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CoachMemberRelationshipResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? coachId,
        [FromQuery] Guid? memberId,
        [FromQuery] bool activeOnly = true,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = CoachMemberRelationshipService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var actorId = User.RequireUserId();

        // HLV và hội viên bị ép về chính mình, bất kể tham số gửi lên — nếu không, bất kỳ HLV
        // nào cũng liệt kê được toàn bộ hội viên của đồng nghiệp.
        if (User.IsInRole(SportHubRoleNames.Coach))
        {
            coachId = actorId;
            activeOnly = true;
        }
        else if (User.IsInRole(SportHubRoleNames.Member))
        {
            memberId = actorId;
        }

        return Ok(await relationships.SearchAsync(coachId, memberId, activeOnly, page, pageSize, ct));
    }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    [ProducesResponseType<CoachMemberRelationshipResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateRelationshipRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await relationships.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{relationshipId:guid}/end")]
    [ProducesResponseType<CoachMemberRelationshipResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> End(
        Guid relationshipId, [FromBody] EndRelationshipRequest request, CancellationToken ct)
        => Ok(await relationships.EndAsync(relationshipId, request.Reason, User.RequireUserId(), ct));
}
