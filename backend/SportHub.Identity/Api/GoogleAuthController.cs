using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Api;

/// <summary>Đăng nhập Google — BR-59, BR-60.</summary>
[ApiController]
[Route("api/auth")]
public class GoogleAuthController(IGoogleAuthService google) : ControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("google")]
    public async Task<IActionResult> Login([FromBody] GoogleTokenRequest request, CancellationToken ct)
    {
        var result = await google.LoginAsync(request.IdToken, ct);

        if (result.RequiresOnboarding)
        {
            return StatusCode(StatusCodes.Status202Accepted, result.Onboarding);
        }

        return Ok(result.Auth);
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth-register")]
    [HttpPost("google/onboarding")]
    public async Task<IActionResult> CompleteOnboarding(
        [FromBody] CompleteGoogleOnboardingRequest request,
        CancellationToken ct)
    {
        var auth = await google.CompleteOnboardingAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, auth);
    }

    [Authorize]
    [HttpPost("google/link")]
    public async Task<IActionResult> Link([FromBody] GoogleTokenRequest request, CancellationToken ct)
    {
        await google.LinkAsync(User.RequireUserId(), request.IdToken, ct);
        return NoContent();
    }

    [Authorize]
    [HttpDelete("google/link")]
    public async Task<IActionResult> Unlink(CancellationToken ct)
    {
        await google.UnlinkAsync(User.RequireUserId(), ct);
        return NoContent();
    }
}
