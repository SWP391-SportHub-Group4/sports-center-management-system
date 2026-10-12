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
                case SportHub.BuildingBlocks.Abstractions.Wallet.InsufficientPointsException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "insufficient_points", ex.Message);
                    break;
                case SportHub.BuildingBlocks.Abstractions.Wallet.WalletReferenceConflictException:
                    await WriteErrorAsync(context, StatusCodes.Status409Conflict, "wallet_reference_conflict", ex.Message);
                    break;
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
                        message = EnglishMessage(conflict.ErrorCode, conflict.Message),
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
                        "The data was changed by another user. Reload and try again.");
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
                "The time slot conflicts with an existing room or coach booking."),
            PostgresErrorCodes.UniqueViolation => (StatusCodes.Status409Conflict, "duplicate_value",
                "The value already exists or the action has already been completed."),
            PostgresErrorCodes.ForeignKeyViolation => (StatusCodes.Status409Conflict, "reference_violation",
                "The referenced data is in use or does not exist."),
            PostgresErrorCodes.CheckViolation => (StatusCodes.Status400BadRequest, "constraint_violation",
                "The data does not satisfy a business constraint."),
            _ => null
        };

    private static Task WriteErrorAsync(HttpContext context, int statusCode, string error, string message)
    {
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(new { error, message = EnglishMessage(error, message) });
    }

    private static string EnglishMessage(string error, string message)
    {
        // Legacy modules still carry Vietnamese exception text. Keep the stable error
        // code and return an English description until each source is translated.
        if (!message.Any(c => c is >= '\u00C0' and <= '\u1EF9')) return message;

        if (string.IsNullOrWhiteSpace(error)) return "The request could not be completed.";
        var words = error.Replace('_', ' ');
        return char.ToUpperInvariant(words[0]) + words[1..] + ".";
    }
}
