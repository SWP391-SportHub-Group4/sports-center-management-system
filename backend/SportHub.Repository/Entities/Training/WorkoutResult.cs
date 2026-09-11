namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Ghi nhận KẾT QUẢ TẬP THỰC TẾ sau 1 session — khác WorkoutPlan (kế hoạch, việc
// SẼ làm) ở chỗ đây là log việc ĐÃ xảy ra. Cập nhật 10/09/2026 (3): dùng 1 FK
// enrollment_id duy nhất (thay session_id + member_id độc lập trước đây) — DB tự
// đảm bảo Member thực sự có đăng ký (Enrollment) session đó; coach_id giữ nguyên
// (không suy ra được qua Enrollment).
// Lưu ý (SSOT §3.1, chưa chốt BR chính thức): FK enrollment_id chỉ đảm bảo
// Enrollment TỒN TẠI, chưa đảm bảo còn hợp lệ (status = Confirmed) — service layer
// phải tự check thêm.
public class WorkoutResult
{
    public Guid ResultId { get; set; }

    public Guid EnrollmentId { get; set; }

    public Enrollment? Enrollment { get; set; }

    // Ai ghi nhận — không suy ra được qua Enrollment nên vẫn giữ FK riêng.
    public Guid CoachId { get; set; }

    public UserAccount? Coach { get; set; }

    // Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg").
    public string? ProgressNote { get; set; }

    // Nhận xét của Coach (định tính).
    public string? CoachComment { get; set; }

    public DateTime RecordedAt { get; set; }
}
