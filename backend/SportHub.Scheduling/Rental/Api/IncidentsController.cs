using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Rental.Api;

[ApiController, Authorize(Policy = SportHubPolicies.CenterManager), Route("api/manager/incidents")]
public sealed class IncidentsController(IncidentService incidents) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await incidents.ListAsync(page, pageSize, ct));

    [HttpGet("{incidentId:guid}")]
    public async Task<IActionResult> Get(Guid incidentId, CancellationToken ct)
        => Ok(await incidents.GetAsync(incidentId, ct));

    [HttpGet("{incidentId:guid}/notifications")]
    public async Task<IActionResult> Notifications(Guid incidentId, CancellationToken ct)
        => Ok(await incidents.DeliveryAsync(incidentId, ct));

    [HttpPost("preview")]
    public async Task<IActionResult> Preview([FromBody] IncidentRequest request, CancellationToken ct)
        => Ok(await incidents.ReviewAsync(request, User.RequireUserId(), ct));

    [HttpPost("drafts/discard")]
    public async Task<IActionResult> DiscardDrafts([FromBody] IReadOnlyList<IncidentDraftReference> references, CancellationToken ct)
        => Ok(await incidents.DiscardDraftsAsync(references, User.RequireUserId(), ct));

    /// <summary>Start handling: holds the window so no one books into it while schedule work is done.</summary>
    [HttpPost("fences")]
    public IActionResult OpenFence([FromBody] IncidentRequest request, CancellationToken ct)
        => throw new SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException("incident_drafts_disabled",
            "Incident reviews are read-only. Confirm the incident to save changes.");

    [HttpGet("fences")]
    public async Task<IActionResult> OpenFences(CancellationToken ct)
        => Ok(await incidents.ListOpenFencesAsync(ct));

    [HttpPost("fences/{fenceId:guid}/extend")]
    public IActionResult ExtendFence(Guid fenceId, CancellationToken ct)
        => throw new SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException("incident_drafts_disabled",
            "Incident reviews no longer create or renew temporary holds.");

    [HttpGet("fences/{fenceId:guid}/steps")]
    public async Task<IActionResult> FenceSteps(Guid fenceId, CancellationToken ct)
        => Ok(await incidents.ListFenceStepsAsync(fenceId, ct));

    /// <summary>Give up on the incident and put back every class session moved or cancelled while it was held.</summary>
    [HttpPost("fences/{fenceId:guid}/abandon")]
    public async Task<IActionResult> AbandonFence(Guid fenceId, CancellationToken ct)
        => Ok(await incidents.AbandonFenceAsync(fenceId, User.RequireUserId(), ct));

    [HttpPost("fences/{fenceId:guid}/release")]
    public async Task<IActionResult> ReleaseFence(Guid fenceId, CancellationToken ct)
    {
        await incidents.ReleaseFenceAsync(fenceId, User.RequireUserId(), ct);
        return NoContent();
    }

    [HttpPost("resolve")]
    public async Task<IActionResult> Resolve([FromBody] IncidentRequest request, CancellationToken ct)
        => Ok(new { incidentId = await incidents.ResolveAsync(request, User.RequireUserId(), ct) });

    [HttpPost("{incidentId:guid}/day-pass-notice")]
    public async Task<IActionResult> DayPassNotice(Guid incidentId, CancellationToken ct)
    {
        await incidents.SendDayPassNoticeAsync(incidentId, User.RequireUserId(), ct);
        return NoContent();
    }
}
