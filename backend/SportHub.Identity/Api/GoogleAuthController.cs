using Microsoft.AspNetCore.Authorization;
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
    /// <summary>
    /// Dùng chung quota rate limit với login thường: cả hai đều là đường cấp JWT cho người
    /// chưa xác thực (SSOT §5.6).
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("google")]
    public async Task<IActionResult> Login([FromBody] GoogleTokenRequest request, CancellationToken ct)
        => Ok(await google.LoginAsync(request.IdToken, ct));

    /// <summary>BR-59 — liên kết tường minh, bắt buộc đang ở trong phiên của chính tài khoản đó.</summary>
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
