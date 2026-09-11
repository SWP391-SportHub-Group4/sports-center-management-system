namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Mới 10/09/2026 (2) — Google Login: tách khỏi UserAccount vì là dữ liệu hiển thị,
// không liên quan cơ chế đăng nhập/phân quyền, thay đổi độc lập với logic auth.
// Quan hệ 1–1 với UserAccount (dùng chung PK).
public class UserProfile
{
    // PK, đồng thời là FK → UserAccount (quan hệ 1–1, dùng chung giá trị user_id).
    public Guid UserId { get; set; }

    public UserAccount? UserAccount { get; set; }

    public string FullName { get; set; } = string.Empty;

    // Unique nếu có giá trị (nullable, cho phép nhiều user cùng để trống; BR-54,
    // ràng buộc #11 — partial unique index WHERE phone IS NOT NULL).
    public string? Phone { get; set; }
}
