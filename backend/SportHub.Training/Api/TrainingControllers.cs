using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

public sealed class EndRelationshipRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

/// <summary>
/// Quan hệ huấn luyện. Tạo/kết thúc là quyền của Center Manager (quyết định C3 — CẦN DUYỆT,
/// BR không nói rõ); HLV và hội viên chỉ xem quan hệ của chính mình.
/// </summary>
[ApiController]
[Authorize]
[Route("api/coach-member-relationships")]
public class CoachMemberRelationshipsController(ICoachMemberRelationshipService relationships) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? coachId,
        [FromQuery] Guid? memberId,
        [FromQuery] bool activeOnly = true,
        CancellationToken ct = default)
    {
        var actorId = User.RequireUserId();

        // HLV và hội viên bị ép về chính mình, bất kể tham số gửi lên — nếu không, bất kỳ HLV
        // nào cũng liệt kê được toàn bộ hội viên của đồng nghiệp.
        if (User.IsInRole(SportHubRoleNames.Coach))
        {
            coachId = actorId;
        }
        else if (User.IsInRole(SportHubRoleNames.Member))
        {
            memberId = actorId;
        }

        return Ok(await relationships.SearchAsync(coachId, memberId, activeOnly, ct));
    }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRelationshipRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await relationships.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{relationshipId:guid}/end")]
    public async Task<IActionResult> End(
        Guid relationshipId, [FromBody] EndRelationshipRequest request, CancellationToken ct)
        => Ok(await relationships.EndAsync(relationshipId, request.Reason, User.RequireUserId(), ct));
}

/// <summary>Kế hoạch và kết quả tập — BR-23, BR-24, BR-25, BR-61.</summary>
[ApiController]
[Authorize]
[Route("api")]
public class WorkoutController(IWorkoutService workouts) : ControllerBase
{
    /// <summary>BR-25 — hội viên XEM kế hoạch của mình. Không có endpoint ghi cho hội viên.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/workout-plans")]
    public async Task<IActionResult> GetMyPlans(CancellationToken ct)
        => Ok(await workouts.GetPlansAsync(User.RequireUserId(), null, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/workout-results")]
    public async Task<IActionResult> GetMyResults(CancellationToken ct)
        => Ok(await workouts.GetResultsAsync(User.RequireUserId(), null, null, ct));

    /// <summary>HLV xem kế hoạch mình đã lập; lọc theo hội viên nếu cần.</summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/workout-plans")]
    public async Task<IActionResult> GetCoachPlans([FromQuery] Guid? memberId, CancellationToken ct = default)
        => Ok(await workouts.GetPlansAsync(memberId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-plans")]
    public async Task<IActionResult> CreatePlan([FromBody] CreateWorkoutPlanRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await workouts.CreatePlanAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/workout-results")]
    public async Task<IActionResult> GetCoachResults([FromQuery] Guid? memberId, CancellationToken ct = default)
        => Ok(await workouts.GetResultsAsync(memberId, User.RequireUserId(), null, ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-results")]
    public async Task<IActionResult> SaveResult([FromBody] SaveWorkoutResultRequest request, CancellationToken ct)
        => Ok(await workouts.SaveResultAsync(request, User.RequireUserId(), ct));

    /// <summary>
    /// HLV xem lịch sử tập của một hội viên — cần cho việc lập kế hoạch và là đầu vào của
    /// gợi ý AI (BR-26). Chỉ xem được hội viên mình ĐANG phụ trách.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("members/{memberId:guid}/workout-results")]
    public async Task<IActionResult> GetMemberResults(
        Guid memberId,
        [FromServices] ICoachMemberRelationshipService relationships,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        var active = await relationships.SearchAsync(coachId, memberId, activeOnly: true, ct);

        if (active.Count == 0)
        {
            throw new ForbiddenException(
                "no_active_relationship", "Bạn không phụ trách hội viên này (BR-23).");
        }

        return Ok(await workouts.GetResultsAsync(memberId, null, null, ct));
    }
}
