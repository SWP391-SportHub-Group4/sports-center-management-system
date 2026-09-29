namespace SportHub.Scheduling.Domain.Enums;

// Điểm danh lớp theo khóa do Lễ tân ghi tay: chỉ Present/Absent. Không còn NoShow cho lớp nhóm (BR-53 cũ đã bỏ);
// PT có PtSessionStatus riêng với NoShow.
public enum AttendanceStatus
{
    Present,
    Absent
}
