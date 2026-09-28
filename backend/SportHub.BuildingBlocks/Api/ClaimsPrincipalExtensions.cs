using System.Security.Claims;

namespace SportHub.BuildingBlocks.Api;

/// <summary>
/// Đọc danh tính người gọi TỪ JWT. Mọi "self action" phải lấy id qua đây chứ không nhận id
/// từ route/body — nhận từ client là mở đường cho việc thao tác hộ người khác.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// UserId từ claim NameIdentifier (JwtService.GenerateAccessToken đặt vào đó, SSOT §5.6).
    /// Ném nếu thiếu hoặc không parse được: endpoint đã qua [Authorize] nên thiếu claim này
    /// nghĩa là token hỏng — thà 500 còn hơn ghi dữ liệu với Guid.Empty.
    /// </summary>
    public static Guid RequireUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

        return Guid.TryParse(raw, out var userId)
            ? userId
            : throw new InvalidOperationException("Authenticated principal has no valid user id claim.");
    }

    /// <summary>Tên role trong token (PascalCase, khớp enum UserRole — SSOT §5.6).</summary>
    public static string RoleName(this ClaimsPrincipal principal)
        => principal.FindFirstValue("role") ?? principal.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
}
