using Microsoft.AspNetCore.Authorization;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Api;

namespace SportHub.API.Extensions;

// Policy theo role — tách khỏi JWT bearer wiring (SportHub.BuildingBlocks/Infrastructure/
// Authentication/JwtBearerExtensions.cs) vì cần enum UserRole của module nghiệp vụ
// Identity. Chỉ SportHub.API (composition root) được phép biết cả BuildingBlocks lẫn
// Identity, nên phần này ở lại đây (mục 3, mục 8, mục 9).
public static class AuthorizationPolicyExtensions
{
    public const string SystemAdministratorPolicy = nameof(SystemAdministratorPolicy);
    public const string CenterManagerPolicy = nameof(CenterManagerPolicy);
    public const string CoachPolicy = nameof(CoachPolicy);
    public const string MemberPolicy = nameof(MemberPolicy);
    public const string ReceptionistPolicy = nameof(ReceptionistPolicy);
    public const string AttendanceCheckInPolicy = nameof(AttendanceCheckInPolicy);

    public static IServiceCollection AddSportHubAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(SystemAdministratorPolicy, p => p.RequireRole(nameof(UserRole.SystemAdministrator)))
            .AddPolicy(CenterManagerPolicy, p => p.RequireRole(nameof(UserRole.CenterManager)))
            .AddPolicy(CoachPolicy, p => p.RequireRole(nameof(UserRole.Coach)))
            .AddPolicy(MemberPolicy, p => p.RequireRole(nameof(UserRole.Member)))
            .AddPolicy(ReceptionistPolicy, p => p.RequireRole(nameof(UserRole.Receptionist)))
            .AddPolicy(AttendanceCheckInPolicy, p => p.RequireRole(
                nameof(UserRole.Coach), nameof(UserRole.Receptionist)))

            // Gym check-in (BR-64) KHÔNG dùng AttendanceCheckInPolicy ở trên: policy đó còn
            // cho Coach, trong khi Gym là việc của riêng Lễ tân. Manager chỉ được đọc lịch sử,
            // và SystemAdministrator không tự được cấp quyền nghiệp vụ Gym (Design v2 §5).
            // Tên policy do chính module Scheduling khai báo
            // (SportHub.Scheduling/Api/GymCheckInPolicies.cs) vì controller ở module đó không
            // tham chiếu ngược lên SportHub.API được.
            .AddPolicy(GymCheckInPolicies.Create, p => p.RequireRole(nameof(UserRole.Receptionist)))
            .AddPolicy(GymCheckInPolicies.ReadAny, p => p.RequireRole(
                nameof(UserRole.Receptionist), nameof(UserRole.CenterManager)))
            .AddPolicy(GymCheckInPolicies.ReadSelf, p => p.RequireRole(nameof(UserRole.Member)));

        return services;
    }
}
