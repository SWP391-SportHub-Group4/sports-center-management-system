using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.API.Middleware;

public sealed class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex) when (!context.RequestAborted.IsCancellationRequested)
        {
            if (context.Response.HasStarted)
            {
                throw;
            }

            switch (ex)
            {
                case EmailAlreadyExistsException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "email_already_exists", ex.Message);
                    break;
                case PhoneAlreadyExistsException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "phone_already_exists", ex.Message);
                    break;
                case InvalidCredentialsException:
                    await WriteErrorAsync(context, StatusCodes.Status401Unauthorized, "invalid_credentials", ex.Message);
                    break;
                case PasswordNotSetException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "password_not_set", ex.Message);
                    break;
                case AccountBlockedException blocked:
                    await WriteErrorAsync(
                        context,
                        StatusCodes.Status403Forbidden,
                        blocked.Status == UserStatus.Banned ? "account_banned" : "account_deactivated",
                        ex.Message);
                    break;
                default:
                    logger.LogError(ex, "Unhandled exception while processing {Method} {Path}", context.Request.Method, context.Request.Path);
                    await WriteErrorAsync(
                        context,
                        StatusCodes.Status500InternalServerError,
                        "internal_server_error",
                        "An unexpected error occurred.");
                    break;
            }
        }
    }

    private static Task WriteErrorAsync(HttpContext context, int statusCode, string error, string message)
    {
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(new { error, message });
    }
}
