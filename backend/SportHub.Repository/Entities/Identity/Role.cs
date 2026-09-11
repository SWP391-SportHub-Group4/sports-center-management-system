using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Danh mục cố định 4 vai trò (seed data), tách riêng để RBAC dễ mở rộng
// (thêm role mới không cần đổi schema UserAccount).
// Naming field: PascalCase theo chuẩn C# (cập nhật — trước đây snake_case theo §5.4).
public class Role
{
    public int RoleId { get; set; }

    // Unique — 4 giá trị cố định, seed data (BR-55, ràng buộc #12).
    public UserRole RoleName { get; set; }

    // 1—N: 1 Role có nhiều UserAccount.
    public ICollection<UserAccount> UserAccounts { get; set; } = new List<UserAccount>();
}
