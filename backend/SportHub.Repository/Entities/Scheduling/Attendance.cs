using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// Cập nhật 10/09/2026 (3): bỏ session_id/member_id — cả 2 suy ra được 100% qua
// enrollment_id (1—1 với Enrollment, nay UNIQUE, ràng buộc #17) — tránh dữ liệu
// trùng lặp có thể lệch nhau. State machine: SSOT §4 / Design v2 §2.2.
public class Attendance
{
    public Guid AttendanceId { get; set; }

    // Unique — enforce đúng quan hệ 1-1 với Enrollment (ràng buộc #17).
    public Guid EnrollmentId { get; set; }

    public Enrollment? Enrollment { get; set; }

    // PRESENT/ABSENT: Coach/Receptionist ghi tay. NO_SHOW: AttendanceFinalizerJob
    // tự sinh sau end_at_utc nếu không check-in và không có Absent ghi tay (BR-53).
    public AttendanceStatus Status { get; set; }

    public DateTime? CheckInTime { get; set; }

    // Nullable — ai thực hiện check-in (Coach/Receptionist); null nếu do job tự
    // động tạo (NO_SHOW).
    public Guid? CheckedInByUserId { get; set; }

    public UserAccount? CheckedInByUser { get; set; }
}
