using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.Coach)]
[Route("api/coaches/me/teaching")]
public sealed class CoachClassSessionChangeRequestsController(ClassSessionChangeRequestService service) : ControllerBase
{
    [HttpPost("sessions/{sessionId:guid}/change-requests")]
    public async Task<IActionResult> Create(Guid sessionId, CreateClassChangeRequest request, CancellationToken ct)
        => Ok(await service.CreateAsync(sessionId, User.RequireUserId(), request, ct));
    [HttpGet("change-requests")]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] Guid? sessionId, [FromQuery] int? classId, [FromQuery] int page = 1, CancellationToken ct = default)
        => Ok(await service.ListAsync(User.RequireUserId(), status, classId, null, sessionId, page, ct));
    [HttpGet("change-requests/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, User.RequireUserId(), ct));
    [HttpPost("change-requests/{id:guid}/withdraw")]
    public async Task<IActionResult> Withdraw(Guid id, CancellationToken ct) => Ok(await service.WithdrawAsync(id, User.RequireUserId(), ct));
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/class-session-change-requests")]
public sealed class ManagerClassSessionChangeRequestsController(ClassSessionChangeRequestService service) : ControllerBase
{
    [HttpGet("filters")]
    public async Task<IActionResult> Filters(CancellationToken ct) => Ok(await service.FiltersAsync(ct));
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int? classId, [FromQuery] Guid? coachId, [FromQuery] int page = 1, CancellationToken ct = default)
        => Ok(await service.ListAsync(null, status, classId, coachId, null, page, ct));
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, null, ct));
    [HttpPost("{id:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid id, ResolveClassChangeRequest request, CancellationToken ct)
        => Ok(await service.ReviewAsync(id, User.RequireUserId(), request, null, ct));
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, RejectClassChangeRequest request, CancellationToken ct)
        => Ok(await service.ReviewAsync(id, User.RequireUserId(), null, request.ReviewNote, ct));
}
