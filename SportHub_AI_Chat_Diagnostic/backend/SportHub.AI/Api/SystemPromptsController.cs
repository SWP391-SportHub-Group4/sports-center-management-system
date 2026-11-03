using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Api;

namespace SportHub.AI.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/ai/system-prompts")]
[RequestSizeLimit(150000)]
public sealed class SystemPromptsController(SystemPromptService service) : ControllerBase
{
    private string Author => User.FindFirstValue(ClaimTypes.Name) ?? "Center Manager";
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(ct));
    [HttpGet("current")]
    public async Task<IActionResult> Current(CancellationToken ct) => Ok(new {
        Member = await service.GetPublishedAsync("Member", ct),
        Coach = await service.GetPublishedAsync("Coach", ct)
    });
    [HttpPut("{id}/draft")]
    public async Task<IActionResult> SaveDraft(string id, SaveSystemPromptRequest request, CancellationToken ct)
        => Ok(await service.SaveAsync(id, request, false, User.RequireUserId(), Author, ct));
    [HttpPost("{id}/publish")]
    public async Task<IActionResult> Publish(string id, SaveSystemPromptRequest request, CancellationToken ct)
        => Ok(await service.SaveAsync(id, request, true, User.RequireUserId(), Author, ct));
    [HttpPost("{id}/restore")]
    public async Task<IActionResult> Restore(string id, RestoreSystemPromptRequest request, CancellationToken ct)
        => Ok(await service.RestoreAsync(id, request, User.RequireUserId(), Author, ct));
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, [FromQuery] int expectedRevision, CancellationToken ct)
    { await service.DeleteAsync(id, expectedRevision, ct); return NoContent(); }
}
