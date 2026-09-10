using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// 1 BUỔI HỌC CỤ THỂ, có ngày giờ thật — là entity Member thực sự đăng ký vào
// (không đăng ký vào Class). Được sinh tự động từ ClassRecurrence, hoặc tạo ad-hoc.
public class ClassSession
{
    public Guid session_id { get; set; }

    public int class_id { get; set; }

    public Class? Class { get; set; }

    // Nullable — sinh ra từ pattern nào; null = session ad-hoc hoặc đã bị reschedule
    // tách khỏi pattern.
    public int? recurrence_id { get; set; }

    public ClassRecurrence? Recurrence { get; set; }

    // Phòng thực tế của buổi này (có thể khác Class.default_room_id nếu đổi phòng).
    public int room_id { get; set; }

    public Room? Room { get; set; }

    // HLV thực tế dạy buổi này (có thể khác default nếu đổi HLV).
    public Guid coach_id { get; set; }

    public UserAccount? Coach { get; set; }

    // Mốc thời gian tuyệt đối (UTC) — dùng để check trùng lịch, tính deadline
    // hủy, tính No-show.
    public DateTime start_at_utc { get; set; }

    public DateTime end_at_utc { get; set; }

    // Sức chứa thực tế buổi này (≤ MIN(Room, Class) tại thời điểm tạo — Manager
    // chỉ được hạ, BR-51).
    public int capacity { get; set; }

    // Denormalized, tăng/giảm nguyên tử mỗi khi có Enrollment CONFIRMED/hủy —
    // dùng để chặn overbooking bằng 1 UPDATE có điều kiện thay vì COUNT() (ràng buộc #2).
    public int confirmed_count { get; set; }

    // SCHEDULED/RESCHEDULED/CANCELLED/COMPLETED — vòng đời của chính buổi học.
    public ClassSessionStatus status { get; set; }

    // Nullable — nếu buổi này là kết quả dời lịch từ buổi khác, trỏ về buổi gốc.
    public Guid? rescheduled_from_session_id { get; set; }

    public ClassSession? RescheduledFromSession { get; set; }

    public ICollection<Enrollment> Enrollments { get; set; } = new List<Enrollment>();
}
