using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Api;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService, IPasswordResetService passwordReset) : ControllerBase
{
    /// <summary>BR-78 — gửi mã OTP 6 số tới email trước khi Register.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth-register-otp")]
    [HttpPost("register/otp")]
    public async Task<IActionResult> RequestRegisterOtp(
        [FromBody] RequestRegisterOtpRequest request,
        CancellationToken cancellationToken)
    {
        await authService.RequestRegisterOtpAsync(request, cancellationToken);
        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth-register")]
    [HttpPost("register")]
    public async Task<IActionResult> Register(
        [FromBody] RegisterRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.RegisterAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request, cancellationToken);
        return Ok(result);
    }

    /// <summary>BR-103 — gửi OTP đặt lại mật khẩu. Luôn 204 (không lộ email có tồn tại hay không).</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth-password-reset")]
    [HttpPost("password/forgot")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await passwordReset.RequestAsync(request, cancellationToken);
        return NoContent();
    }

    /// <summary>BR-103/104 — đặt lại mật khẩu bằng OTP; không cần mật khẩu cũ; vô hiệu mọi token cũ.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth-password-reset")]
    [HttpPost("password/reset")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await passwordReset.ResetAsync(request, cancellationToken);
        return NoContent();
    }
}
