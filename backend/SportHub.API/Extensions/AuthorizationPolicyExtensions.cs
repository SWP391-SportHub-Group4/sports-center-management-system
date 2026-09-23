using Microsoft.AspNetCore.Authorization;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Api;

namespace SportHub.API.Extensions;

// Policy theo role — tách khỏi JWT bearer wiring (SportHub.BuildingBlocks/Infrastructure/
// Authentication/JwtBearerExtensions.cs) vì cần enum UserRole của module nghiệp vụ
// Identity. Chỉ SportHub.API (composition root) được phép biết cả BuildingBlocks lẫn
// Identity, nên phần này ở lại đây.
//
// TÊN policy do BuildingBlocks khai báo (SportHubPolicies) để controller ở mọi module tham
// chiếu được; ÁNH XẠ tên → role nằm ở đây. Ma trận RBAC nguồn: Design v2 §5 + BR kèm theo.
public static class AuthorizationPolicyExtensions
{
    // Giữ lại các hằng cũ: test hiện có và TestProtectedController đang tham chiếu trực tiếp.
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

            // Tên cũ — không đổi để không phá hợp đồng của test đang xanh.
            .AddPolicy(SystemAdministratorPolicy, p => p.RequireRole(nameof(UserRole.SystemAdministrator)))
            .AddPolicy(CenterManagerPolicy, p => p.RequireRole(nameof(UserRole.CenterManager)))
            .AddPolicy(CoachPolicy, p => p.RequireRole(nameof(UserRole.Coach)))
            .AddPolicy(MemberPolicy, p => p.RequireRole(nameof(UserRole.Member)))
            .AddPolicy(ReceptionistPolicy, p => p.RequireRole(nameof(UserRole.Receptionist)))
            .AddPolicy(AttendanceCheckInPolicy, p => p.RequireRole(
                nameof(UserRole.Coach), nameof(UserRole.Receptionist)))

            // Tên dùng chung cho controller của mọi module.
            .AddPolicy(SportHubPolicies.SystemAdministrator, p => p.RequireRole(nameof(UserRole.SystemAdministrator)))
            .AddPolicy(SportHubPolicies.CenterManager, p => p.RequireRole(nameof(UserRole.CenterManager)))
            .AddPolicy(SportHubPolicies.Coach, p => p.RequireRole(nameof(UserRole.Coach)))
            .AddPolicy(SportHubPolicies.Member, p => p.RequireRole(nameof(UserRole.Member)))
            .AddPolicy(SportHubPolicies.Receptionist, p => p.RequireRole(nameof(UserRole.Receptionist)))

            // Quầy lễ tân: bán gói, thu tiền, đăng ký/hủy hộ hội viên (BR-17, BR-30, BR-42).
            .AddPolicy(SportHubPolicies.FrontDesk, p => p.RequireRole(
                nameof(UserRole.Receptionist), nameof(UserRole.CenterManager)))

            // BR-22 — điểm danh lớp.
            .AddPolicy(SportHubPolicies.AttendanceCheckIn, p => p.RequireRole(
                nameof(UserRole.Coach), nameof(UserRole.Receptionist)))

            // Đọc dữ liệu vận hành. KHÔNG có SystemAdministrator: phạm vi quyền của vai trò này
            // ngoài BR-2/BR-6 chưa được Business Rules chốt (SSOT §7), nên giữ ❌ như ma trận
            // RBAC hiện hành thay vì tự nới ra.
            .AddPolicy(SportHubPolicies.StaffRead, p => p.RequireRole(
                nameof(UserRole.CenterManager), nameof(UserRole.Receptionist), nameof(UserRole.Coach)))

            // Gym check-in (BR-64) KHÔNG dùng AttendanceCheckInPolicy: policy đó còn cho Coach,
            // trong khi Gym là việc của riêng Lễ tân. Manager chỉ được đọc lịch sử.
            .AddPolicy(GymCheckInPolicies.Create, p => p.RequireRole(nameof(UserRole.Receptionist)))
            .AddPolicy(GymCheckInPolicies.ReadAny, p => p.RequireRole(
                nameof(UserRole.Receptionist), nameof(UserRole.CenterManager)))
            .AddPolicy(GymCheckInPolicies.ReadSelf, p => p.RequireRole(nameof(UserRole.Member)));

        return services;
    }
}
