namespace SportHub.API.Extensions;

/// <summary>
/// CORS cho FE (Next.js) gọi BE. Origin đọc từ appsettings "Cors:AllowedOrigins"
/// (mảng string) — KHÔNG hard-code port ở đây để dev/staging/prod mỗi nơi 1 danh sách khác nhau.
/// </summary>
public static class CorsExtensions
{
    public const string PolicyName = "Default";

    public static IServiceCollection AddSportHubCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var allowedOrigins = configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();

        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, policy =>
            {
                if (allowedOrigins.Length == 0)
                {
                    // Chưa cấu hình appsettings -> fallback cho dev local (FE Next.js mặc định port 3000).
                    // TODO: xoá fallback này khi appsettings.Development.json đã có Cors:AllowedOrigins.
                    allowedOrigins = new[] { "http://localhost:3000" };
                }

                policy.WithOrigins(allowedOrigins)
                      .AllowAnyHeader()
                      .AllowAnyMethod()
                      .AllowCredentials(); // cần nếu FE gửi cookie/Authorization kèm request
            });
        });

        return services;
    }
}
