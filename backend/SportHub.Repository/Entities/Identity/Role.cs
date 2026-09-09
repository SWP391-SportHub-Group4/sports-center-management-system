using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Danh mục cố định 4 vai trò (seed data), tách riêng để RBAC dễ mở rộng
// (thêm role mới không cần đổi schema User).
public class Role
{
    public int RoleID { get; set; }

    public UserRole RoleName { get; set; }

    // 1—N: 1 Role có nhiều User.
    public ICollection<User> Users { get; set; } = new List<User>();
}
