using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace SportHub.API.RateLimiting;

/// <summary>
/// Rate limit riêng cho POST /api/auth/login, partition theo IP.
/// Tách thành policy riêng (không dùng chung "auth-register") để OnRejected của login
/// không đổi response của register, và để hai endpoint có quota độc lập.
///
/// Ngưỡng 10 request / 1 phút là QUYẾT ĐỊNH KỸ THUẬT khởi đầu của task này, không phải
/// con số do business rule quy định — chỉnh được mà không cần đổi BR.
///
/// Giới hạn đã biết: limiter lưu in-memory theo từng instance nên reset khi restart và
/// không chia sẻ giữa nhiều instance; nhiều client sau cùng một NAT dùng chung quota;
/// không chống được tấn công phân tán nhiều IP. Limiter tập trung (Redis/gateway) và
/// khoá theo tài khoản nằm ngoài phạm vi task.
/// </summary>
public sealed class LoginRateLimitPolicy : IRateLimiterPolicy<string>
{
    public const string PolicyName = "auth-login";
    public const int PermitLimit = 10;
    public const int WindowMinutes = 1;

    public static readonly TimeSpan Window = TimeSpan.FromMinutes(WindowMinutes);

    public Func<OnRejectedContext, CancellationToken, ValueTask>? OnRejected => static (context, _) =>
    {
        var response = context.HttpContext.Response;

        response.StatusCode = StatusCodes.Status429TooManyRequests;
        response.ContentType = "application/json";

        // Chỉ set Retry-After khi lease thực sự cung cấp metadata — không bịa thời gian.
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
            response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        }

        return new ValueTask(response.WriteAsync(
            """{"error":"too_many_requests","message":"Too many login attempts. Please try again later."}"""));
    };

    public RateLimitPartition<string> GetPartition(HttpContext httpContext)
        => RateLimitPartition.GetFixedWindowLimiter(
            GetPartitionKey(httpContext),
            static _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = PermitLimit,
                Window = Window,
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            });

    /// <summary>
    /// Chỉ dùng Connection.RemoteIpAddress — KHÔNG đọc X-Forwarded-For, vì repo chưa cấu
    /// hình trusted proxy và header đó client tự đặt được, sẽ biến rate limit thành vô dụng.
    /// Khi deploy sau reverse proxy: cấu hình ForwardedHeadersOptions với đúng
    /// KnownProxies/KnownNetworks của môi trường và chạy TRƯỚC UseRateLimiter.
    /// Không dùng email/password hay bất kỳ dữ liệu body nào làm partition key.
    /// </summary>
    private static string GetPartitionKey(HttpContext httpContext)
    {
        var ip = httpContext.Connection.RemoteIpAddress;

        if (ip is null)
        {
            return "unknown";
        }

        // ::ffff:127.0.0.1 và 127.0.0.1 phải rơi vào cùng một partition.
        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        return ip.ToString();
    }
}
