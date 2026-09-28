using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Domain.Entities;

/// <summary>
/// Phân loại nghiệp vụ của tài khoản role Coach (BR-96) — không nhân bản họ tên/số điện
/// thoại (UserProfile) hay mật khẩu (UserCredential), và không lưu payroll/hoa hồng/hợp đồng.
///
/// Vòng đời khi đổi role (chốt 28/09/2026 (2), SSOT §7): giữ record làm lịch sử, không cascade
/// delete, không field trạng thái riêng — UserAccount.RoleId hiện tại quyết định hiệu lực.
/// Đổi role trở lại Coach phải chọn CoachCategory mới tường minh (không tự khôi phục giá trị cũ).
/// </summary>
public class CoachProfile
{
    public Guid UserId { get; set; } // PK, đồng thời FK -> UserAccount (1-1)

    public UserAccount? UserAccount { get; set; }

    public CoachCategory CoachCategory { get; set; }
}
