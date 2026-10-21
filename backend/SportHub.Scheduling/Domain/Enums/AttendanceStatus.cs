namespace SportHub.Scheduling.Domain.Enums;

// Điểm danh lớp theo khóa do Lễ tân ghi tay: chỉ Present/Absent. Không còn NoShow cho lớp nhóm (BR-53 cũ đã bỏ);
public enum AttendanceStatus
{
    Present,
    Absent
}
