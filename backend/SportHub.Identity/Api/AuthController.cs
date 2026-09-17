using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Api;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService) : ControllerBase
{
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
    // Tên policy để literal: policy được định nghĩa ở SportHub.API
    // (RateLimiting/LoginRateLimitPolicy.cs) và module Identity KHÔNG được phụ thuộc ngược
    // lên composition root. Phải khớp LoginRateLimitPolicy.PolicyName — có test chốt việc này.
    [EnableRateLimiting("auth-login")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request, cancellationToken);

        return Ok(result);
    }
}
