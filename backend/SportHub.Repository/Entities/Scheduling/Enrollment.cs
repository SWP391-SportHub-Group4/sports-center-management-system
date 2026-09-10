using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// Ghi nhận 1 Member đăng ký vào 1 session cụ thể, gắn với gói nào bị trừ buổi —
// entity trung tâm của flow "Đặt lớp". State machine: SSOT §4 / Design v2 §2.2;
// ràng buộc #1–#4 (Design v2 §3).
public class Enrollment
{
    public Guid enrollment_id { get; set; }

    public Guid session_id { get; set; }

    public ClassSession? Session { get; set; }

    public Guid member_id { get; set; }

    public UserAccount? Member { get; set; }

    // Gói nào bị trừ remaining_sessions cho lượt đăng ký này.
    public Guid member_package_id { get; set; }

    public MemberPackage? MemberPackage { get; set; }

    // CONFIRMED/CANCELLED_ON_TIME/CANCELLED_LATE — quyết định có hoàn credit hay
    // không (BR-17/18).
    public EnrollmentStatus status { get; set; }

    public DateTime registered_at { get; set; }

    public DateTime? cancelled_at { get; set; }

    // Nullable — ai bấm hủy, có thể khác Member (vd Receptionist hủy giúp) — audit.
    public Guid? cancelled_by_user_id { get; set; }

    public UserAccount? CancelledByUser { get; set; }

    // 1—1 — kết quả điểm danh sau khi session diễn ra (ràng buộc #17, UNIQUE enrollment_id).
    public Attendance? Attendance { get; set; }

    public ICollection<WorkoutResult> WorkoutResults { get; set; } = new List<WorkoutResult>();
}
