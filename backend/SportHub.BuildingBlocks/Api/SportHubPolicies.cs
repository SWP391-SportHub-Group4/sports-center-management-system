namespace SportHub.BuildingBlocks.Api;

/// <summary>
/// TÊN các authorization policy, để controller trong mọi module tham chiếu được.
///
/// Chỉ có tên ở đây; ánh xạ tên → role nằm ở SportHub.API/Extensions/AuthorizationPolicyExtensions.cs
/// (composition root) vì ánh xạ đó cần enum UserRole của module Identity, mà BuildingBlocks
/// không được phụ thuộc module nghiệp vụ. Cùng cách làm với GymCheckInPolicies trước đây,
/// nhưng gom về một chỗ để không phải mỗi module lại khai báo một bộ hằng riêng.
///
/// Ma trận RBAC nguồn: Center-Management-System-Design-v2.md §5 + các BR được ghi kèm.
/// </summary>
public static class SportHubPolicies
{
    /// <summary>BR-2, BR-6 — tạo tài khoản nhân sự, gán vai trò, khoá/mở khoá.</summary>
    public const string SystemAdministrator = nameof(SystemAdministrator);

    /// <summary>BR-8, BR-14, BR-32, BR-39, BR-42, BR-43 — cấu hình, lớp học, duyệt điều chỉnh, báo cáo.</summary>
    public const string CenterManager = nameof(CenterManager);

    public const string Coach = nameof(Coach);

    public const string Member = nameof(Member);

    public const string Receptionist = nameof(Receptionist);

    /// <summary>
    /// Quầy lễ tân + quản lý: bán gói, ghi nhận thanh toán, hủy đăng ký hộ hội viên
    /// (BR-17, BR-30). Hai vai trò này cùng làm được nên gộp một policy thay vì rải
    /// [Authorize] hai lần trên từng action.
    /// </summary>
    public const string FrontDesk = nameof(FrontDesk);

    /// <summary>BR-22 — điểm danh lớp: Coach được gán buổi đó, hoặc Lễ tân tại quầy.</summary>
    public const string AttendanceCheckIn = nameof(AttendanceCheckIn);

    /// <summary>
    /// Đọc dữ liệu vận hành (lịch lớp, danh sách hội viên, hoá đơn): Manager, Lễ tân, Coach.
    /// KHÔNG gồm SystemAdministrator — phạm vi quyền của vai trò này ngoài BR-2/BR-6 chưa được
    /// Business Rules chốt (SSOT §7), nên để ❌ như ma trận RBAC hiện hành thay vì tự nới.
    /// </summary>
    public const string StaffRead = nameof(StaffRead);
}
