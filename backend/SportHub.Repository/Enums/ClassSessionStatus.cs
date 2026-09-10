namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd ClassSessionStatus.Scheduled <-> "SCHEDULED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trạng thái 1 buổi học cụ thể. Chưa có state diagram riêng — xem SSOT §4.
/// Dùng ở: ClassSession.status.
/// </summary>
public enum ClassSessionStatus
{
    Scheduled,
    Rescheduled,
    Cancelled,
    Completed
}
