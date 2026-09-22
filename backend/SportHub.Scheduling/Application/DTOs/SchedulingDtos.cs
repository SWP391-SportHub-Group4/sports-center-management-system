using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.DTOs;

public sealed record RoomResponse(int RoomId, string Name, int Capacity, int ActiveClassCount);

public sealed class SaveRoomRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(1, 500)]
    public int Capacity { get; set; }
}

public sealed record ClassRecurrenceResponse(
    int RecurrenceId,
    string DaysOfWeek,
    TimeOnly StartTimeLocal,
    TimeOnly EndTimeLocal,
    string Timezone,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo);

public sealed record ClassResponse(
    int ClassId,
    string Name,
    string Discipline,
    int DefaultRoomId,
    string DefaultRoomName,
    int RoomCapacity,
    Guid? DefaultCoachId,
    string? DefaultCoachName,
    int Capacity,
    string Status,
    IReadOnlyList<ClassRecurrenceResponse> Recurrences);

public sealed class SaveClassRequest
{
    [Required, MinLength(2), MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>PersonalTraining/Yoga/GroupX — KHÔNG có Gym (Gym đi qua GymCheckIn, BR-64).</summary>
    [Required]
    public string Discipline { get; set; } = string.Empty;

    /// <summary>BR-12 — lớp chỉ tạo được khi đã gán Phòng tập.</summary>
    [Required]
    public int DefaultRoomId { get; set; }

    /// <summary>BR-12 — HLV có thể gán lúc tạo hoặc sau đó, nên nullable.</summary>
    public Guid? DefaultCoachId { get; set; }

    [Range(1, 500)]
    public int Capacity { get; set; }
}

public sealed class SaveRecurrenceRequest
{
    /// <summary>Danh sách thứ viết tắt tiếng Anh, phân tách bằng dấu phẩy: MON,WED,FRI.</summary>
    [Required]
    public string DaysOfWeek { get; set; } = string.Empty;

    [Required]
    public TimeOnly StartTimeLocal { get; set; }

    [Required]
    public TimeOnly EndTimeLocal { get; set; }

    [Required]
    public DateOnly EffectiveFrom { get; set; }

    public DateOnly? EffectiveTo { get; set; }
}

public sealed record ClassSessionResponse(
    Guid SessionId,
    int ClassId,
    string ClassName,
    string Discipline,
    int RoomId,
    string RoomName,
    Guid CoachId,
    string CoachName,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    int Capacity,
    int BaselineCapacity,
    int ConfirmedCount,
    string Status,
    Guid? RescheduledFromSessionId,
    bool IsFull);

/// <summary>Buổi học kèm tình trạng đăng ký của chính người đang xem — dùng cho màn hình hội viên.</summary>
public sealed record MemberSessionResponse(ClassSessionResponse Session, Guid? MyEnrollmentId, string? MyEnrollmentStatus);

public sealed class CreateAdHocSessionRequest
{
    [Required]
    public int ClassId { get; set; }

    [Required]
    public DateTime StartAtUtc { get; set; }

    [Required]
    public DateTime EndAtUtc { get; set; }

    /// <summary>Null = dùng phòng/HLV mặc định của lớp.</summary>
    public int? RoomId { get; set; }

    public Guid? CoachId { get; set; }
}

public sealed class GenerateSessionsRequest
{
    [Required]
    public DateOnly FromDate { get; set; }

    [Required]
    public DateOnly ToDate { get; set; }
}

public sealed class UpdateSessionRequest
{
    public int? RoomId { get; set; }

    public Guid? CoachId { get; set; }

    /// <summary>BR-51 — chỉ được giảm, không vượt trần tại thời điểm tạo buổi.</summary>
    public int? Capacity { get; set; }
}

public sealed class CancelSessionRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

public sealed class RescheduleSessionRequest
{
    [Required]
    public DateTime NewStartAtUtc { get; set; }

    [Required]
    public DateTime NewEndAtUtc { get; set; }

    public int? NewRoomId { get; set; }

    public Guid? NewCoachId { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

public sealed record EnrollmentResponse(
    Guid EnrollmentId,
    Guid SessionId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    Guid MemberPackageId,
    string Status,
    DateTime RegisteredAt,
    DateTime? CancelledAt,
    int CancellationDeadlineHours,
    DateTime CancellationDeadlineUtc,
    string? AttendanceStatus,
    ClassSessionResponse Session);

public sealed class CreateEnrollmentRequest
{
    [Required]
    public Guid SessionId { get; set; }

    /// <summary>
    /// Null = hệ thống tự chọn gói dùng được sớm hết hạn nhất. Chỉ định tường minh khi hội
    /// viên có nhiều gói cùng dùng được (BR-10 cho phép cộng dồn nếu Manager duyệt).
    /// </summary>
    public Guid? MemberPackageId { get; set; }

    /// <summary>Chỉ Lễ tân đăng ký hộ được; hội viên tự đăng ký thì bỏ trống (lấy từ JWT).</summary>
    public Guid? MemberId { get; set; }
}

public sealed record AttendanceResponse(
    Guid AttendanceId,
    Guid EnrollmentId,
    Guid MemberId,
    string MemberName,
    string Status,
    DateTime? CheckInTime,
    Guid? CheckedInByUserId);

public sealed class MarkAttendanceRequest
{
    /// <summary>
    /// BR-53 — chỉ Present hoặc Absent. NoShow do AttendanceFinalizerJob tự sinh (BR-20),
    /// không nhận từ client.
    /// </summary>
    [Required]
    public string Status { get; set; } = string.Empty;
}

public sealed record SessionRosterResponse(
    ClassSessionResponse Session,
    IReadOnlyList<RosterEntryResponse> Entries);

public sealed record RosterEntryResponse(
    Guid EnrollmentId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    string EnrollmentStatus,
    string? AttendanceStatus,
    DateTime? CheckInTime);
