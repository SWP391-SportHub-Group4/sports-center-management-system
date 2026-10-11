using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

public sealed record ReportAvatarRequest(Guid TargetUserId, string Reason);

[ApiController]
[Authorize]
[Route("api/avatars")]
public sealed class AvatarsController(AvatarService avatars) : ControllerBase
{
    [HttpGet("{userId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct)
        => Ok(await avatars.GetAsync(userId, User.Identity?.IsAuthenticated != true, ct));

    [HttpPost("me")]
    [EnableRateLimiting("avatar-write")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0 || file.Length > AvatarService.MaxUploadBytes)
            throw new BadRequestException("avatar_size_invalid", "The image must be no larger than 5 MB.");
        await using var input = file.OpenReadStream();
        await using var output = new MemoryStream();
        await input.CopyToAsync(output, ct);
        return Ok(await avatars.UploadAsync(User.RequireUserId(), output.ToArray(), file.ContentType, ct));
    }

    [HttpDelete("me")]
    [EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Delete(CancellationToken ct)
        => Ok(await avatars.DeleteAsync(User.RequireUserId(), ct));

    [HttpPost("reports")]
    [EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Report([FromBody] ReportAvatarRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created,
            new { reportId = await avatars.ReportAsync(User.RequireUserId(), request.TargetUserId, request.Reason, ct) });
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/avatar-reports")]
public sealed class ManagerAvatarReportsController(AvatarService avatars) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string status = "PENDING", CancellationToken ct = default)
        => Ok(await avatars.ListReportsAsync(status, ct));

    [HttpPost("{reportId:guid}/dismiss")]
    public async Task<IActionResult> Dismiss(Guid reportId, CancellationToken ct)
    {
        await avatars.ReviewAsync(User.RequireUserId(), reportId, remove: false, ct);
        return NoContent();
    }

    [HttpPost("{reportId:guid}/remove")]
    public async Task<IActionResult> Remove(Guid reportId, CancellationToken ct)
    {
        await avatars.ReviewAsync(User.RequireUserId(), reportId, remove: true, ct);
        return NoContent();
    }
}
