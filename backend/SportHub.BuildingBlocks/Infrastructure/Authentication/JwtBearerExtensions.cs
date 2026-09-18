using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(nameof(JwtOptions)))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        var jwtOptions = configuration.GetSection(nameof(JwtOptions)).Get<JwtOptions>()
            ?? throw new InvalidOperationException($"Thiếu section '{nameof(JwtOptions)}' trong config.");

        var validationResults = new List<ValidationResult>();
        if (!Validator.TryValidateObject(jwtOptions, new ValidationContext(jwtOptions), validationResults, true))
        {
            var errors = string.Join(" | ", validationResults.Select(r => r.ErrorMessage));
            throw new InvalidOperationException(
                $"Cấu hình JwtOptions không hợp lệ: {errors}. " +
                "Dev: set trong appsettings.Development.json. " +
                "Production: set qua biến môi trường JwtOptions__SecretKey (>= 32 ký tự), " +
                "không để giá trị mặc định trong appsettings.json.");
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SecretKey));

        services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtOptions.Issuer,
                    ValidAudience = jwtOptions.Audience,
                    IssuerSigningKey = signingKey,
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
                            """{"error":"forbidden","message":"Your account does not have permission to perform this action."}""");
                    }
                };
            });

        return services;
    }
}
