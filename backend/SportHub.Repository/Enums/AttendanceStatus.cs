namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd AttendanceStatus.Present <-> "PRESENT") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Điểm danh. Present/Absent ghi tay (BR-53), NoShow do AttendanceFinalizerJob tự sinh. State machine: SSOT §4 / Design v2 §2.2.
/// Dùng ở: Attendance.Status.
/// </summary>
public enum AttendanceStatus
{
    Present,
    Absent,
    NoShow
}
