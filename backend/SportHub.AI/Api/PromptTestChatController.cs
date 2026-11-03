using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Api;

namespace SportHub.AI.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/ai/prompts/test-chat")]
public sealed class PromptTestChatController(PromptTestChatService service) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("prompt-test")]
    [RequestSizeLimit(150000)]
    public async Task<ActionResult<PromptTestChatResponse>> Chat([FromBody] PromptTestChatRequest request, CancellationToken ct)
        => Ok(await service.AskAsync(User.RequireUserId(), request, ct));
}
