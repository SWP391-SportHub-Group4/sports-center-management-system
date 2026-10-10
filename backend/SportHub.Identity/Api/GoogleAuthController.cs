using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Api;

/// <summary>Đăng nhập Google: tự tạo tài khoản hoặc tự liên kết theo email đã xác minh (docs/SportManagement_BusinessRules_v2.0_updated.docx, mục P).</summary>
[ApiController]
[Route("api/auth")]
public class GoogleAuthController(IGoogleAuthService google) : ControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("google")]
    public async Task<IActionResult> Login([FromBody] GoogleTokenRequest request, CancellationToken ct)
        => Ok(await google.LoginAsync(request.IdToken, ct));

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
