using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.Identity.Application.Auth;

namespace SportHub.API.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class GoogleAuthController(GoogleAuthService authService) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("google")]
    public Task<IActionResult> Google(GoogleAuthRequest request, CancellationToken ct) => ExecuteAsync(async () =>
        Ok(await authService.GoogleLoginAsync(request.IdToken, ct)));

    [Authorize(Roles = "Member,Coach,Receptionist,CenterManager")]
    [HttpPost("google/link")]
    public Task<IActionResult> LinkGoogle(GoogleAuthRequest request, CancellationToken ct) => ExecuteAsync(async () =>
    {
        // JwtService currently emits the NameIdentifier URI claim (MapInboundClaims=false).
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized(new { error = "INVALID_USER_ID", message = "The JWT does not contain a valid user identifier." });
        await authService.LinkGoogleAsync(userId, request.IdToken, ct);
        return NoContent();
    });

    private async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> action)
    {
        try { return await action(); }
        catch (AuthException ex) { return StatusCode(ex.StatusCode, new { error = ex.Code, message = ex.Message }); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return Conflict(new { error = "AUTH_CONFLICT", message = "The email or Google link already exists. Please try again. If the email already exists, sign in first and link Google in Settings." });
        }
    }
}
