using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Middleware;

/// <summary>
/// Enforces the current database account state for every authenticated request.
/// This is required because a previously issued JWT would otherwise remain usable
/// after an Admin bans/deactivates the account or changes its role.
/// </summary>
public sealed class CurrentAccountGuardMiddleware
{
    private readonly RequestDelegate _next;

    public CurrentAccountGuardMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, SportHubDbContext dbContext)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var subject = context.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);

            if (!Guid.TryParse(subject, out var userId))
            {
                await RejectAsync(context, StatusCodes.Status401Unauthorized, "invalid_subject", "Authenticated token does not contain a valid user id.");
                return;
            }

            var account = await dbContext.UserAccounts
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .Select(x => new
                {
                    x.Status,
                    Role = x.Role != null ? x.Role.RoleName : (UserRole?)null
                })
                .SingleOrDefaultAsync(context.RequestAborted);

            if (account is null)
            {
                await RejectAsync(context, StatusCodes.Status401Unauthorized, "account_not_found", "The account referenced by the token no longer exists.");
                return;
            }

            if (account.Status != UserStatus.Active)
            {
                await RejectAsync(context, StatusCodes.Status403Forbidden, "account_not_active", "The account is banned or deactivated.");
                return;
            }

            if (account.Role is null)
            {
                await RejectAsync(context, StatusCodes.Status403Forbidden, "role_missing", "The account does not have a valid role.");
                return;
            }

            var tokenRole = context.User.FindFirstValue("role")
                ?? context.User.FindFirstValue(ClaimTypes.Role);

            if (!RoleMatches(tokenRole, account.Role.Value))
            {
                await RejectAsync(context, StatusCodes.Status401Unauthorized, "role_changed", "The account role changed after this token was issued. Please sign in again.");
                return;
            }
        }

        await _next(context);
    }

    private static bool RoleMatches(string? tokenRole, UserRole databaseRole)
    {
        if (string.IsNullOrWhiteSpace(tokenRole))
            return false;

        static string Normalize(string value)
            => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

        return Normalize(tokenRole) == Normalize(databaseRole.ToString());
    }

    private static Task RejectAsync(HttpContext context, int statusCode, string code, string message)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(new { error = code, message });
    }
}
