using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

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
