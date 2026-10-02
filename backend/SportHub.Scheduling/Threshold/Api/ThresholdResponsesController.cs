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
    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await responses.MineAsync(User.RequireUserId(), ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await responses.GetAsync(id, null, User.RequireUserId(), ct));

    [HttpGet("by-token")]
    public async Task<IActionResult> ByToken([FromQuery] string token, CancellationToken ct) => Ok(await responses.GetAsync(null, token, User.RequireUserId(), ct));

    [HttpGet("{id:guid}/transfer-quote")]
    public async Task<IActionResult> Quote(Guid id, [FromQuery] int targetClassId, CancellationToken ct)
        => Ok(await responses.QuoteTransferAsync(id, targetClassId, User.RequireUserId(), ct));

    [HttpPost("{id:guid}")]
    public async Task<IActionResult> RespondById(Guid id, SubmitThresholdByIdRequest request, CancellationToken ct)
        => Ok(await responses.RespondByIdAsync(id, request.Choice, request.TargetClassId, User.RequireUserId(), ct));

    [HttpPost]
    public async Task<IActionResult> Respond([FromBody] SubmitThresholdResponseRequest request, CancellationToken ct)
        => Ok(await responses.RespondAsync(request.Token, request.Choice, request.TargetClassId,
            User.RequireUserId(), ct));
}

public sealed record SubmitThresholdResponseRequest(string Token, ThresholdResponseChoice Choice, int? TargetClassId);

public sealed record SubmitThresholdByIdRequest(ThresholdResponseChoice Choice, int? TargetClassId);
