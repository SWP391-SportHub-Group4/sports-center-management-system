using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Bảng người dùng gốc — mọi vai trò (Manager, Coach, Member, Receptionist) đều là
// 1 row ở đây, phân biệt qua RoleID. Không tách bảng riêng cho từng vai trò để
// tránh trùng lặp logic auth/login (xem docs/entity-field-purpose.md § USERS).
public class User
{
    public Guid UserID { get; set; }

    public string FullName { get; set; } = string.Empty;

    // Unique không phân biệt hoa/thường (BR-49, index LOWER(email)) — ràng buộc
    // này chưa được cấu hình ở đây, sẽ thêm ở EF Core Fluent Configuration.
    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public int RoleID { get; set; }

    public Role? Role { get; set; }

    // ACTIVE/BANNED/DEACTIVATED — không xoá cứng user (giữ lịch sử Payment/Attendance).
    public UserStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }
}
