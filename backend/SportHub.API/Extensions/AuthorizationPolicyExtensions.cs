using Microsoft.AspNetCore.Authorization;
using SportHub.Identity.Domain.Enums;

namespace SportHub.API.Extensions;

// Policy theo role — tách khỏi JWT bearer wiring (SportHub.BuildingBlocks/Infrastructure/
// Authentication/JwtBearerExtensions.cs) vì cần enum UserRole của module nghiệp vụ
// Identity. Chỉ SportHub.API (composition root) được phép biết cả BuildingBlocks lẫn
// Identity, nên phần này ở lại đây (mục 3, mục 8, mục 9).
public static class AuthorizationPolicyExtensions
{
    public const string CenterManagerPolicy = nameof(CenterManagerPolicy);
    public const string CoachPolicy = nameof(CoachPolicy);
    public const string MemberPolicy = nameof(MemberPolicy);
    public const string ReceptionistPolicy = nameof(ReceptionistPolicy);
    public const string AttendanceCheckInPolicy = nameof(AttendanceCheckInPolicy);

    public static IServiceCollection AddSportHubAuthorizationPolicies(this IServiceCollection services)
    {
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
