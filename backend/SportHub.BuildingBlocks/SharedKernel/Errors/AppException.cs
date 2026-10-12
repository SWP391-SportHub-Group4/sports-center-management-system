using Microsoft.AspNetCore.Http;

namespace SportHub.BuildingBlocks.SharedKernel.Errors;

/// <summary>
/// Lỗi nghiệp vụ mang sẵn HTTP status + error code ổn định cho client.
///
/// Có kiểu này thì ExceptionHandlingMiddleware không phải liệt kê từng exception của từng
/// module — danh sách đó đã dài và mỗi module mới lại buộc composition root phải biết thêm
/// chi tiết nghiệp vụ. Các exception cũ của Identity/Scheduling vẫn giữ case riêng trong
/// middleware để không đổi hợp đồng lỗi mà test hiện có đang kiểm chứng.
///
/// ErrorCode là snake_case, khớp quy ước sẵn có (invalid_credentials, no_active_member_package).
/// </summary>
public class AppException(int statusCode, string errorCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public string ErrorCode { get; } = errorCode;
}

public sealed class NotFoundException(string errorCode, string message)
    : AppException(StatusCodes.Status404NotFound, errorCode, message);

public sealed class ConflictException(string errorCode, string message)
    : AppException(StatusCodes.Status409Conflict, errorCode, message);

/// <summary>409 kèm danh sách lý do cụ thể khiến không thể đổi vai trò (xem UserAdminService.ChangeRoleAsync).</summary>
public sealed class RoleChangeBlockedException(IReadOnlyList<string> reasons)
    : AppException(StatusCodes.Status409Conflict, "role_change_blocked", "Role change is blocked.")
{
    public IReadOnlyList<string> Reasons { get; } = reasons;
}

/// <summary>
/// Chủ thể đã xác thực nhưng không được phép làm hành động này trên đối tượng này
/// (ownership hoặc quan hệ nghiệp vụ). Khác với thiếu role — thiếu role bị policy chặn trước khi vào service.
/// </summary>
public sealed class ForbiddenException(string errorCode, string message)
    : AppException(StatusCodes.Status403Forbidden, errorCode, message);

public sealed class BadRequestException(string errorCode, string message)
    : AppException(StatusCodes.Status400BadRequest, errorCode, message);
