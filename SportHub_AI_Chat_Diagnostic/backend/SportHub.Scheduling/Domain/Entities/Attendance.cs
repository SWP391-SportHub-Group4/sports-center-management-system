namespace SportHub.Scheduling.Domain.Entities;

/// <summary>Điểm danh một ghi danh ở một buổi. Chỉ Lễ tân ghi (Present/Absent); unique (EnrollmentId, SessionId).</summary>
public class Attendance
{
    public Guid AttendanceId { get; set; }

    public Guid EnrollmentId { get; set; }

    public Enrollment? Enrollment { get; set; }

    public Guid SessionId { get; set; }

    public ClassSession? Session { get; set; }

    public AttendanceStatus Status { get; set; }

    /// <summary>Lễ tân ghi lần đầu (cross-module, chỉ scalar).</summary>
    public Guid RecordedByUserId { get; set; }

    public DateTime RecordedAt { get; set; }

    /// <summary>Lần sửa gần nhất trong cửa sổ 24 giờ sau buổi.</summary>
    public DateTime? LastModifiedAt { get; set; }
}
