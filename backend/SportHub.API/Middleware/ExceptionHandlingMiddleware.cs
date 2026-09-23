using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Exceptions;
using SportHub.Scheduling.Domain.Exceptions;

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
                // Scheduling — Gym check-in (BR-64) và ràng buộc bộ môn (SSOT §1.1).
                case MemberNotFoundException:
                    await WriteErrorAsync(context, StatusCodes.Status404NotFound, "member_not_found", ex.Message);
                    break;
                case NoActiveMemberPackageException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "no_active_member_package", ex.Message);
                    break;
                case InvalidDisciplineException:
                    await WriteErrorAsync(context, StatusCodes.Status400BadRequest, "invalid_discipline", ex.Message);
                    break;
                case InvalidClassCapacityException:
                    await WriteErrorAsync(context, StatusCodes.Status400BadRequest, "invalid_class_capacity", ex.Message);
                    break;
                case AccountBlockedException blocked:
                    await WriteErrorAsync(
                        context,
                        StatusCodes.Status403Forbidden,
                        blocked.Status == UserStatus.Banned ? "account_banned" : "account_deactivated",
                        ex.Message);
                    break;
                // Lỗi nghiệp vụ của các module mới: status + error code đi kèm chính exception,
                // nên composition root không phải liệt kê từng kiểu một. Đặt SAU các case cụ
                // thể ở trên để không đổi hợp đồng lỗi mà test hiện có đang kiểm chứng.
                case AppException appException:
                    await WriteErrorAsync(context, appException.StatusCode, appException.ErrorCode, ex.Message);
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
