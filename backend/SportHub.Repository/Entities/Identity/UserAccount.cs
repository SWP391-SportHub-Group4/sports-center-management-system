using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Cập nhật 10/09/2026 (2) — Google Login: bảng định danh + vòng đời GỐC, tách khỏi
// UserCredential (auth nội bộ) và UserProfile (hiển thị) — thay thế entity `User` cũ
// (đã bỏ, xem docs/entity-field-purpose.md § USER_ACCOUNTS). Đây là bảng cha mà gần
// như mọi entity khác (member, coach, staff...) trỏ FK vào (member_id, coach_id,
// issued_by_user_id...) — các FK đó KHÔNG đổi tên cột, chỉ đổi entity đích từ User
// sang UserAccount.
public class UserAccount
{
    public Guid UserId { get; set; }

    public string Email { get; set; } = string.Empty;

    public int RoleId { get; set; }

    public Role? Role { get; set; }

    // ACTIVE/BANNED/DEACTIVATED — không xoá cứng user (giữ lịch sử Payment/Attendance).
    public UserStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    // 1—1: local auth (nullable — account Google-only có thể chưa có row này).
    public UserCredential? Credential { get; set; }

    // 1—1: thông tin hiển thị (nullable cho tới khi được tạo).
    public UserProfile? Profile { get; set; }

    // 1—N: các provider đăng nhập ngoài (Google...) đã link.
    public ICollection<UserExternalLogin> ExternalLogins { get; set; } = new List<UserExternalLogin>();
}
