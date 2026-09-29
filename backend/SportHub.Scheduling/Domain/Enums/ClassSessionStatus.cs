namespace SportHub.Scheduling.Domain.Enums;

// Trạng thái 1 buổi học. Dời lịch giữ nguyên Scheduled (đổi giờ/phòng/coach); hủy buổi luôn đi kèm buổi bù.
public enum ClassSessionStatus
{
    Scheduled,
    Completed,
    Cancelled
}
