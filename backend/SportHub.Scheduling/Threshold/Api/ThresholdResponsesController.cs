using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.Member)]
[Route("api/class-threshold-responses")]
public sealed class ThresholdResponsesController(ThresholdResponseService responses) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Respond([FromBody] SubmitThresholdResponseRequest request, CancellationToken ct)
        => Ok(await responses.RespondAsync(request.Token, request.Choice, request.TargetClassId,
            User.RequireUserId(), ct));
}

public sealed record SubmitThresholdResponseRequest(string Token, ThresholdResponseChoice Choice, int? TargetClassId);
