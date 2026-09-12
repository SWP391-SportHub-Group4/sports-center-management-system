namespace SportHub.Repository.Entities.Scheduling;

public class Attendance
{
    public Guid AttendanceId { get; set; } // PK

    public Guid EnrollmentId { get; set; } // FK -> Enrollment, unique (1-1)

    public Enrollment? Enrollment { get; set; }

    public AttendanceStatus Status { get; set; } // Present/Absent ghi tay, NoShow do job tự sinh

    public DateTime? CheckInTime { get; set; } // thời điểm check-in thật nếu có

    public Guid? CheckedInByUserId { get; set; } // FK -> UserAccount, null nếu job tự động tạo (NoShow)

    public UserAccount? CheckedInByUser { get; set; }
}
