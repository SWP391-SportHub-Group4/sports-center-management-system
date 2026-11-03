using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

public sealed class UploadAvatarRequest
{
    public IFormFile? File { get; set; }
}

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
    public async Task<IActionResult> Upload([FromForm] UploadAvatarRequest request, CancellationToken ct)
    {
        var file = request.File;
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
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/members/{memberId:guid}/avatar")]
public sealed class ManagerMemberAvatarController(AvatarService avatars) : ControllerBase
{
    [HttpDelete]
    [EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Delete(Guid memberId, CancellationToken ct)
        => Ok(await avatars.ManagerDeleteMemberAsync(User.RequireUserId(), memberId, ct));
}
