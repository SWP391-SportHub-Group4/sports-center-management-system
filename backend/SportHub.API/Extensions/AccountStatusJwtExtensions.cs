using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.API.Extensions;

/// <summary>
/// BR-6: tài khoản bị khoá không được "tiếp tục sử dụng các chức năng yêu cầu xác thực".
/// JWT là stateless nên chữ ký + hạn dùng hợp lệ vẫn chưa đủ — phải đọc trạng thái tài khoản
/// từ DB ở mỗi request đã xác thực.
///
/// Đặt ở SportHub.API (composition root) chứ không phải BuildingBlocks: hook này cần
/// IUserAccountRepository của module Identity, mà BuildingBlocks không được phụ thuộc
/// module nghiệp vụ (cùng lý do với AuthorizationPolicyExtensions).
///
/// Ngữ nghĩa đã chốt của task: sau khi thay đổi trạng thái đã commit, request xác thực TIẾP
/// THEO bị chặn. Request đang chạy hoặc kết nối dài đã xác thực không bị huỷ. Khi mở khoá,
/// token cũ còn hạn dùng lại được. Thu hồi token vĩnh viễn (security stamp / token version,
/// logout-all, refresh token, WebSocket) KHÔNG nằm trong phạm vi và chưa được triển khai.
/// </summary>
public static class AccountStatusJwtExtensions
{
    public static IServiceCollection AddAccountStatusJwtValidation(this IServiceCollection services)
    {
        // PostConfigure để chạy SAU AddSportHubJwtBearer: bổ sung OnTokenValidated vào
        // Events đã có, KHÔNG gán Events mới (sẽ mất OnChallenge/OnForbidden tuỳ biến)
        // và không đặt EventsType.
        services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            var events = options.Events ??= new JwtBearerEvents();
            var previous = events.OnTokenValidated;

            events.OnTokenValidated = async context =>
            {
                if (previous is not null)
                {
                    await previous(context);

                    // Handler trước đã tự quyết định kết quả -> không ghi đè.
                    if (context.Result is not null)
                    {
                        return;
                    }
                }

                // Chỉ đọc claim từ principal đã qua validation chữ ký/issuer/audience/lifetime.
                // Không đọc userId từ body/query, không tự decode token.
                var userIdClaim = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);

                if (!Guid.TryParse(userIdClaim, out var userId) || userId == Guid.Empty)
                {
                    // Token hợp lệ về chữ ký nhưng thiếu/sai subject -> từ chối, và không
                    // query DB. Lý do để chung chung, response cuối do OnChallenge quyết định.
                    context.Fail("Account is unavailable.");
                    return;
                }

                // Repository là scoped -> resolve từ request services, KHÔNG capture vào
                // options (singleton) để tránh giữ DbContext của request cũ.
                var repository = context.HttpContext.RequestServices
                    .GetRequiredService<IUserAccountRepository>();

                // Không catch lỗi DB ở đây: fail closed. Exception được JwtBearerHandler
                // ném tiếp lên ExceptionHandlingMiddleware -> 500, và protected action
                // không chạy. Nuốt lỗi rồi coi user là Active sẽ phá đúng BR-6.
                var isActive = await repository.IsActiveAsync(userId, context.HttpContext.RequestAborted);

                if (!isActive)
                {
                    // Banned / Deactivated / user không còn tồn tại đều rơi vào đây.
                    // Không tiết lộ trạng thái cụ thể của tài khoản trong response.
                    context.Fail("Account is unavailable.");
                }
            };
        });

        return services;
    }
}
