using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace SportHub.BuildingBlocks.Infrastructure.Authentication;

// Chỉ phần JWT bearer wiring dùng chung (đọc JwtOptions, validate token, xử lý
// 401/403 mặc định). Phần policy theo role (CenterManagerPolicy, CoachPolicy...)
// tách sang SportHub.API/Extensions/AuthorizationPolicyExtensions.cs vì cần
// enum UserRole của module Identity — BuildingBlocks không được phụ thuộc
// module nghiệp vụ nào (mục 3, mục 8).
public static class JwtBearerExtensions
{
    public static IServiceCollection AddSportHubJwtBearer(
        this IServiceCollection services)
    {
        services
            .AddOptions<JwtOptions>()
            .Configure<IConfiguration>((options, configuration) =>
                configuration.GetSection(nameof(JwtOptions)).Bind(options))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer();

        // Resolve the final host configuration after test or deployment overrides have been applied.
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtOptions>>((options, jwtOptions) =>
            {
                var jwt = jwtOptions.Value;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SecretKey)),
                    ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = ClaimTypes.NameIdentifier,
                    RoleClaimType = ClaimTypes.Role,
                };

                options.Events = new JwtBearerEvents
                {
                    OnChallenge = context =>
                    {
                        context.HandleResponse();
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        context.Response.ContentType = "application/json";
                        return context.Response.WriteAsync(
                            """{"error":"unauthorized","message":"The token is missing, invalid, or expired."}""");
                    },
                    OnForbidden = context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        context.Response.ContentType = "application/json";
                        return context.Response.WriteAsync(
                            """{"error":"forbidden","message":"This account is not allowed to perform this action."}""");
                    }
                };
            });

        return services;
    }
}
