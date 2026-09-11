using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using SportHub.Repository.Enums;
using SportHub.Service.Utils.JWTService;

namespace SportHub.API.Extensions;

public static class JwtExtensions
{
    public const string CenterManagerPolicy = nameof(CenterManagerPolicy);
    public const string CoachPolicy = nameof(CoachPolicy);
    public const string MemberPolicy = nameof(MemberPolicy);
    public const string ReceptionistPolicy = nameof(ReceptionistPolicy);
    public const string AttendanceCheckInPolicy = nameof(AttendanceCheckInPolicy);

    public static IServiceCollection AddSportHubJwtAuthentication(
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
                            """{"error":"unauthorized","message":"Token thiếu, sai định dạng hoặc đã hết hạn."}""");
                    },
                    OnForbidden = context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        context.Response.ContentType = "application/json";
                        return context.Response.WriteAsync(
                            """{"error":"forbidden","message":"Tài khoản không có quyền thực hiện hành động này."}""");
                    }
                };
            });

        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(CenterManagerPolicy, p => p.RequireRole(nameof(UserRole.CenterManager)))
            .AddPolicy(CoachPolicy, p => p.RequireRole(nameof(UserRole.Coach)))
            .AddPolicy(MemberPolicy, p => p.RequireRole(nameof(UserRole.Member)))
            .AddPolicy(ReceptionistPolicy, p => p.RequireRole(nameof(UserRole.Receptionist)))
            .AddPolicy(AttendanceCheckInPolicy, p => p.RequireRole(
                nameof(UserRole.Coach), nameof(UserRole.Receptionist)));

        return services;
    }
}
