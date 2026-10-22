using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;

namespace SportHub.API.Middleware;

/// <summary>Enforce the bootstrap password change for every authenticated API request.</summary>
public sealed class InitialAdminPasswordMiddleware(RequestDelegate next)
{
    public const string RequiredKey = "InitialAdminMustChangePassword";

    public async Task InvokeAsync(HttpContext context, SportHubDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true
            && Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
            && !IsPasswordChangeRequest(context.Request))
        {
            var mustChange = context.Items.TryGetValue(RequiredKey, out var item) && item is bool value
                ? value
                : await db.UserAccounts.AsNoTracking()
                    .Where(u => u.UserId == userId)
                    .Select(u => u.MustChangePassword)
                    .SingleOrDefaultAsync(context.RequestAborted);
            if (mustChange)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    error = "initial_password_change_required",
                    message = "Change the initial administrator password before using the system."
                }, context.RequestAborted);
                return;
            }
        }

        await next(context);
    }

    private static bool IsPasswordChangeRequest(HttpRequest request)
        => request.Path.Equals("/api/users/me", StringComparison.OrdinalIgnoreCase)
            && HttpMethods.IsGet(request.Method)
            || request.Path.Equals("/api/users/me/password", StringComparison.OrdinalIgnoreCase)
            && HttpMethods.IsPost(request.Method);
}
