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
        => Ok(await incidents.PreviewAsync(request, ct));

    [HttpPost("resolve")]
    public async Task<IActionResult> Resolve([FromBody] IncidentRequest request, CancellationToken ct)
        => Ok(new { incidentId = await incidents.ResolveAsync(request, User.RequireUserId(), ct) });
}
