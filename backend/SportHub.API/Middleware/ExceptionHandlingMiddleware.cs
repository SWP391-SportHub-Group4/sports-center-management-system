using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
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
                case AccountBlockedException blocked:
                    await WriteErrorAsync(
                        context,
                        StatusCodes.Status403Forbidden,
                        blocked.Status == UserStatus.Banned ? "account_banned" : "account_deactivated",
                        ex.Message);
                    break;
                // Xung đột lịch phòng/coach: 409 kèm danh sách khoảng đang chiếm chỗ.
                case OccupancyConflictException conflict:
                    context.Response.StatusCode = StatusCodes.Status409Conflict;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        error = conflict.ErrorCode,
                        message = conflict.Message,
                        conflicts = conflict.Conflicts
                    });
                    break;
                // Lỗi nghiệp vụ của các module mới: status + error code đi kèm chính exception,
                // nên composition root không phải liệt kê từng kiểu một. Đặt SAU các case cụ
                // thể ở trên để không đổi hợp đồng lỗi mà test hiện có đang kiểm chứng.
                case AppException appException:
                    await WriteErrorAsync(context, appException.StatusCode, appException.ErrorCode, ex.Message);
                    break;
                // Ràng buộc DB chưa được service bắt riêng: trả mã lỗi ổn định, không lộ SQL/tên ràng buộc.
                case DbUpdateConcurrencyException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "concurrency_conflict",
                        "Dữ liệu vừa được người khác thay đổi. Vui lòng tải lại và thử lại.");
                    break;
                case var _ when TryFindPostgresException(ex) is { } pg && MapPostgres(pg) is { } mapped:
                    await WriteErrorAsync(context, mapped.Status, mapped.Code, mapped.Message);
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

    private static PostgresException? TryFindPostgresException(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException!)
        {
            if (current is PostgresException pg)
            {
                return pg;
            }

            if (current.InnerException is null)
            {
                break;
            }
        }

        return null;
    }

    private static (int Status, string Code, string Message)? MapPostgres(PostgresException pg)
        => pg.SqlState switch
        {
            PostgresErrorCodes.ExclusionViolation => (StatusCodes.Status409Conflict, "occupancy_conflict",
                "Khung giờ đã có lịch khác chiếm phòng hoặc coach."),
            PostgresErrorCodes.UniqueViolation => (StatusCodes.Status409Conflict, "duplicate_value",
                "Giá trị đã tồn tại hoặc thao tác đã được thực hiện."),
            PostgresErrorCodes.ForeignKeyViolation => (StatusCodes.Status409Conflict, "reference_violation",
                "Dữ liệu đang được tham chiếu hoặc tham chiếu không tồn tại."),
            PostgresErrorCodes.CheckViolation => (StatusCodes.Status400BadRequest, "constraint_violation",
                "Dữ liệu không thỏa ràng buộc nghiệp vụ."),
            _ => null
        };

    private static Task WriteErrorAsync(HttpContext context, int statusCode, string error, string message)
    {
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(new { error, message });
    }
}
