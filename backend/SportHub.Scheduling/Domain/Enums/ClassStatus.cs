namespace SportHub.Scheduling.Domain.Enums;

// Vòng đời khóa học: Draft (Manager soạn, công chúng không thấy) → Published (nhận ghi danh) → InProgress (đã qua buổi đầu)
// → Completed. Cancelled: hủy khi chưa có ghi danh, hoặc do trung tâm hủy (ngưỡng hoàn vốn).
public enum ClassStatus
{
    Draft,
    Published,
    InProgress,
    Completed,
    Cancelled
}
