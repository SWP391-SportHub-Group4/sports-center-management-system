namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd UserRole.CenterManager <-> "CENTER_MANAGER") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Vai trò người dùng — khớp 4 vai trò trong đề bài.
/// Dùng ở: Role.RoleName, User.RoleID (FK), JWT role claim.
/// </summary>
public enum UserRole
{
    CenterManager,
    Coach,
    Member,
    Receptionist
}
