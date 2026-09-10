namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd EnrollmentStatus.Confirmed <-> "CONFIRMED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Vòng đời đăng ký lớp của Member. State machine: SSOT §4 / Design v2 §2.2.
/// Dùng ở: Enrollment.status.
/// </summary>
public enum EnrollmentStatus
{
    Confirmed,
    CancelledOnTime,
    CancelledLate
}
