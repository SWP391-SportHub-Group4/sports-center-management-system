using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

/// <summary>Hồ sơ và mật khẩu của chính người dùng đang đăng nhập.</summary>
[ApiController]
[Authorize]
[Route("api/users/me")]
public class AccountController(IAccountService accounts, CoachAvatarService avatars) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMe(CancellationToken ct)
        => Ok(await accounts.GetMeAsync(User.RequireUserId(), ct));

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateMyProfileRequest request, CancellationToken ct)
        => Ok(await accounts.UpdateProfileAsync(User.RequireUserId(), request, ct));

    [HttpPost("avatar")]
    [Authorize(Policy = SportHubPolicies.Coach)]
    [EnableRateLimiting("avatar-upload")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(CoachAvatarService.MaxBytes + 65536)]
    [RequestFormLimits(MultipartBodyLengthLimit = CoachAvatarService.MaxBytes + 65536)]
    public async Task<IActionResult> UploadAvatar(IFormFile file, CancellationToken ct)
    {
        var userId = User.RequireUserId();
        await avatars.UploadAsync(userId, file, ct);
        return Ok(await accounts.GetMeAsync(userId, ct));
    }

    /// <summary>Luồng A bước 1: gửi mã 6 số về email để tài khoản chưa có mật khẩu (Google) xác nhận trước khi tạo mật khẩu.</summary>
    [HttpPost("password/otp")]
    [EnableRateLimiting("auth-register-otp")]
    public async Task<IActionResult> RequestSetPasswordOtp(CancellationToken ct)
    {
        await accounts.RequestSetPasswordOtpAsync(User.RequireUserId(), ct);
        return NoContent();
    }

    /// <summary>Tạo mật khẩu lần đầu (kèm OTP) hoặc đổi mật khẩu (kèm mật khẩu hiện tại); trả JWT mới cho phiên hiện tại.</summary>
    [HttpPost("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
        => Ok(await accounts.ChangePasswordAsync(User.RequireUserId(), request, ct));
}
