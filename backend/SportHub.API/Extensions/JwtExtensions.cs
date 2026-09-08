namespace SportHub.API.Extensions;

/// <summary>
/// STUB — chưa implement. Xem TODO (bước 1 - Identity/RBAC) trong Program.cs cũ
/// và docs/Center-Management-System-Design-v2.md mục 7.
/// Khi làm Identity/RBAC, chuyển 2 dòng comment trong Program.cs vào đây:
///   services.AddAuthentication(...).AddJwtBearer(...);
///   services.AddAuthorization(options => { /* policies theo bảng RBAC */ });
/// và đọc secret/issuer/audience từ appsettings (mục "Jwt": { "Issuer", "Audience", "Key" } — CHƯA có, cần thêm).
/// </summary>
public static class JwtExtensions
{
    public static IServiceCollection AddSportHubJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // TODO: implement khi làm Identity/RBAC (không phải phần của skeleton này).
        return services;
    }
}
