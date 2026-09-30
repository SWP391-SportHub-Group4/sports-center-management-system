using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

/// <summary>
/// Kế hoạch và kết quả tập — BR-23, BR-24, BR-25, BR-61, BR-99 (mới 28/09/2026: mọi action Coach
/// ở đây chỉ dành cho CoachCategory.PersonalTrainer — ClassInstructor không có nghiệp vụ này,
/// kiểm tra ở backend chứ không chỉ ẩn menu FE).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public class WorkoutController(IWorkoutService workouts, PersonalTrainerGuard personalTrainers) : ControllerBase
{
    /// <summary>BR-25 — hội viên XEM kế hoạch của mình. Không có endpoint ghi cho hội viên.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/workout-plans")]
    [ProducesResponseType<IReadOnlyList<WorkoutPlanResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPlans(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await workouts.GetPlansAsync(User.RequireUserId(), null, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/workout-results")]
    [ProducesResponseType<IReadOnlyList<WorkoutResultResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyResults(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await workouts.GetResultsAsync(User.RequireUserId(), null, null, page, pageSize, ct));

    /// <summary>HLV xem kế hoạch mình đã lập; lọc theo hội viên nếu cần.</summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/workout-plans")]
    [ProducesResponseType<IReadOnlyList<WorkoutPlanResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCoachPlans(
        [FromQuery] Guid? memberId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return Ok(await workouts.GetPlansAsync(memberId, coachId, page, pageSize, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-plans")]
    [ProducesResponseType<WorkoutPlanResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> CreatePlan([FromBody] CreateWorkoutPlanRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return StatusCode(StatusCodes.Status201Created, await workouts.CreatePlanAsync(request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPut("workout-plans/{planId:guid}")]
    [ProducesResponseType<WorkoutPlanResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePlan(
        Guid planId, [FromBody] UpdateWorkoutPlanRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        return Ok(await workouts.UpdatePlanAsync(planId, request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-plans/{planId:guid}/activate")]
    [ProducesResponseType<WorkoutPlanResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ActivatePlan(Guid planId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        return Ok(await workouts.ActivatePlanAsync(planId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-plans/{planId:guid}/archive")]
    [ProducesResponseType<WorkoutPlanResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ArchivePlan(Guid planId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        return Ok(await workouts.ArchivePlanAsync(planId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/workout-results")]
    [ProducesResponseType<IReadOnlyList<WorkoutResultResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCoachResults(
        [FromQuery] Guid? memberId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return Ok(await workouts.GetResultsAsync(memberId, coachId, null, page, pageSize, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-results")]
    [ProducesResponseType<WorkoutResultResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveResult([FromBody] SaveWorkoutResultRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        return Ok(await workouts.SaveResultAsync(request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPut("workout-results/{ptSessionId:guid}")]
    [ProducesResponseType<WorkoutResultResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveResult(
        Guid ptSessionId, [FromBody] SaveWorkoutResultRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        request.PtSessionId = ptSessionId;
        return Ok(await workouts.SaveResultAsync(request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/progress")]
    [ProducesResponseType<ProgressTimelineResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCoachProgress(
        [FromQuery] Guid memberId,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);
        return Ok(await workouts.GetProgressAsync(memberId, coachId, fromUtc, toUtc, page, pageSize, ct));
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/progress")]
    [ProducesResponseType<ProgressTimelineResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMemberProgress(
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await workouts.GetProgressAsync(
            User.RequireUserId(), null, fromUtc, toUtc, page, pageSize, ct));

    /// <summary>
    /// HLV xem lịch sử tập của một hội viên — cần cho việc lập kế hoạch và là đầu vào của
    /// gợi ý AI (BR-26). Chỉ xem được hội viên mình ĐANG phụ trách.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("members/{memberId:guid}/workout-results")]
    [ProducesResponseType<IReadOnlyList<WorkoutResultResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMemberResults(
        Guid memberId,
        [FromServices] ICoachMemberRelationshipService relationships,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorkoutService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await personalTrainers.RequireAsync(coachId, ct);

        var active = await relationships.SearchAsync(
            coachId, memberId, activeOnly: true, page: 1, pageSize: 1, ct: ct);

        if (active.Count == 0)
        {
            throw new ForbiddenException(
                "no_active_relationship", "Bạn không phụ trách hội viên này (BR-23).");
        }

        return Ok(await workouts.GetResultsAsync(memberId, null, null, page, pageSize, ct));
    }
}
