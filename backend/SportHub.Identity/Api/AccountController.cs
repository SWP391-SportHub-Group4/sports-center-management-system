using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Api;

public sealed class GoogleTokenRequest
{
    [Required]
    public string IdToken { get; set; } = string.Empty;
}

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

/// <summary>Hồ sơ và mật khẩu của chính người dùng đang đăng nhập.</summary>
[ApiController]
[Authorize]
[Route("api/users/me")]
public class AccountController(IAccountService accounts) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMe(CancellationToken ct)
        => Ok(await accounts.GetMeAsync(User.RequireUserId(), ct));

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateMyProfileRequest request, CancellationToken ct)
        => Ok(await accounts.UpdateProfileAsync(User.RequireUserId(), request, ct));

    /// <summary>BR-60 — đặt mật khẩu lần đầu (tài khoản Google-only) hoặc đổi mật khẩu.</summary>
    [HttpPost("password")]
    public async Task<IActionResult> SetPassword([FromBody] SetPasswordRequest request, CancellationToken ct)
    {
        await accounts.SetPasswordAsync(User.RequireUserId(), request, ct);

        return NoContent();
    }
}
