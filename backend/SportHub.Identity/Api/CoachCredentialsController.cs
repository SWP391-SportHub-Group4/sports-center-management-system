using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

public class CoachCredentialDetailsRequest
{
    [Required, RegularExpression("^(CERTIFICATE|AWARD)$")] public string Kind { get; set; } = "CERTIFICATE";
    [Required, MaxLength(200)] public string Title { get; set; } = string.Empty;
    [MaxLength(200)] public string? Issuer { get; set; }
    public DateOnly? IssuedOn { get; set; }
    public bool IsPublished { get; set; } = true;
}
public sealed class UploadCoachCredentialRequest : CoachCredentialDetailsRequest { public IFormFile? File { get; set; } }
public sealed class UpdateCoachCredentialRequest : CoachCredentialDetailsRequest { [Range(1, int.MaxValue)] public int Version { get; set; } }

[ApiController, Route("api/coaches")]
public sealed class CoachCredentialsController(CoachCredentialService service) : ControllerBase
{
    [HttpGet("{coachId:guid}/credentials"), AllowAnonymous]
    public async Task<IActionResult> Public(Guid coachId, CancellationToken ct) => Ok(await service.ListAsync(coachId, false, ct));

    [HttpGet("me/credentials"), Authorize(Roles = SportHubRoleNames.Coach)]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await service.ListAsync(User.RequireUserId(), true, ct));

    [HttpPost("me/credentials"), Authorize(Roles = SportHubRoleNames.Coach), EnableRateLimiting("avatar-write")]
    [Consumes("multipart/form-data"), RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] UploadCoachCredentialRequest request, CancellationToken ct)
    {
        var file = request.File;
        if (file is null || file.Length == 0 || file.Length > CoachCredentialService.MaxUploadBytes)
            throw new BadRequestException("credential_size_invalid", "Choose a JPG, PNG, WebP or PDF document no larger than 10 MB.");
        await using var input = file.OpenReadStream();
        await using var output = new MemoryStream();
        await input.CopyToAsync(output, ct);
        return Ok(await service.UploadAsync(User.RequireUserId(), request.Kind, request.Title, request.Issuer, request.IssuedOn,
            request.IsPublished, output.ToArray(), file.ContentType, file.FileName, ct));
    }

    [HttpPut("me/credentials/{credentialId:guid}"), Authorize(Roles = SportHubRoleNames.Coach)]
    public async Task<IActionResult> Update(Guid credentialId, UpdateCoachCredentialRequest request, CancellationToken ct)
        => Ok(await service.UpdateAsync(User.RequireUserId(), credentialId, request.Kind, request.Title, request.Issuer,
            request.IssuedOn, request.IsPublished, request.Version, ct));

    [HttpDelete("me/credentials/{credentialId:guid}"), Authorize(Roles = SportHubRoleNames.Coach), EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Delete(Guid credentialId, CancellationToken ct)
    { await service.DeleteAsync(User.RequireUserId(), credentialId, ct); return NoContent(); }
}
