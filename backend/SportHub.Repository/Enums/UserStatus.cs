namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd UserStatus.Active <-> "ACTIVE") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trạng thái tài khoản — không xoá cứng user (giữ lịch sử Payment/Attendance).
/// Dùng ở: User.Status.
/// </summary>
public enum UserStatus
{
    Active,
    Banned,
    Deactivated
}
