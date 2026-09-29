using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Application.Services;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Api;

[ApiController]
[Authorize]
[Route("api")]
[Produces("application/json")]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status409Conflict)]
public sealed class HomeworkController(
    IHomeworkService homework,
    ICoachProfileReader coachProfiles) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("coaches/me/homework")]
    [ProducesResponseType<IReadOnlyList<HomeworkResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForCoach(
        [FromQuery] Guid? memberId,
        [FromQuery] HomeworkAssignmentStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = HomeworkService.DefaultPageSize,
        CancellationToken ct = default)
    {
        var coachId = User.RequireUserId();
        await RequirePtAsync(coachId, ct);
        return Ok(await homework.GetForCoachAsync(coachId, memberId, status, page, pageSize, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/homework")]
    [ProducesResponseType<HomeworkResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateHomeworkRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await RequirePtAsync(coachId, ct);
        return StatusCode(StatusCodes.Status201Created, await homework.CreateAsync(request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPut("coaches/me/homework/{assignmentId:guid}")]
    [ProducesResponseType<HomeworkResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(
        Guid assignmentId, [FromBody] UpdateHomeworkRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await RequirePtAsync(coachId, ct);
        return Ok(await homework.UpdateAsync(assignmentId, request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/homework/{assignmentId:guid}/review")]
    [ProducesResponseType<HomeworkResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Review(
        Guid assignmentId, [FromBody] ReviewHomeworkRequest request, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await RequirePtAsync(coachId, ct);
        return Ok(await homework.ReviewAsync(assignmentId, request, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("coaches/me/homework/{assignmentId:guid}/cancel")]
    [ProducesResponseType<HomeworkResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Cancel(Guid assignmentId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();
        await RequirePtAsync(coachId, ct);
        return Ok(await homework.CancelAsync(assignmentId, coachId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/homework")]
    [ProducesResponseType<IReadOnlyList<HomeworkResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForMember(
        [FromQuery] HomeworkAssignmentStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = HomeworkService.DefaultPageSize,
        CancellationToken ct = default)
        => Ok(await homework.GetForMemberAsync(User.RequireUserId(), status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPatch("members/me/homework/{assignmentId:guid}")]
    [ProducesResponseType<HomeworkResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateByMember(
        Guid assignmentId, [FromBody] UpdateMemberHomeworkRequest request, CancellationToken ct)
        => Ok(await homework.UpdateByMemberAsync(assignmentId, request, User.RequireUserId(), ct));

    private Task RequirePtAsync(Guid coachId, CancellationToken ct)
        => coachProfiles.RequireCategoryAsync(coachId, CoachCategory.PersonalTrainer, ct);
}
