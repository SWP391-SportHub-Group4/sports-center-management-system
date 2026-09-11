using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class Enrollment
{
    public Guid EnrollmentId { get; set; } // PK

    public Guid SessionId { get; set; } // FK -> ClassSession

    public ClassSession? Session { get; set; }

    public Guid MemberId { get; set; } // FK -> UserAccount

    public UserAccount? Member { get; set; }

    public Guid MemberPackageId { get; set; } // FK -> MemberPackage bị trừ buổi

    public MemberPackage? MemberPackage { get; set; }

    public EnrollmentStatus Status { get; set; } // Confirmed/CancelledOnTime/CancelledLate

    public DateTime RegisteredAt { get; set; }

    public DateTime? CancelledAt { get; set; } // so với deadline để phân loại ON_TIME/LATE

    public Guid? CancelledByUserId { get; set; } // FK -> UserAccount, có thể khác Member (vd Receptionist hủy giúp)

    public UserAccount? CancelledByUser { get; set; }

    public Attendance? Attendance { get; set; } // 1-1

    public ICollection<WorkoutResult> WorkoutResults { get; set; } = new List<WorkoutResult>();
}
