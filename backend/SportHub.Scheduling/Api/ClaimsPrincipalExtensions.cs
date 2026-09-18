using System.Security.Claims;

namespace SportHub.Scheduling.Api;

internal static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// UserId từ claim NameIdentifier (JwtService.GenerateAccessToken đặt vào đó).
    /// Ném nếu thiếu hoặc không parse được: endpoint đã qua [Authorize] rồi nên thiếu
    /// claim này nghĩa là token hỏng — thà 500 còn hơn ghi check-in với Guid.Empty.
    /// </summary>
    public static Guid RequireUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(ClaimTypes.NameIdentifier);

        return Guid.TryParse(raw, out var userId)
            ? userId
            : throw new InvalidOperationException("Authenticated principal has no valid user id claim.");
    }
}
