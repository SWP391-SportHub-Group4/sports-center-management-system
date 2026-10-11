namespace SportHub.Scheduling.Domain.Entities;

/// <summary>
/// Một buổi của khóa. Sĩ số thuộc <see cref="Class"/> nên buổi không có capacity/confirmed. Phòng và coach chiếm chỗ qua
/// RoomOccupancy/CoachOccupancy (nguồn ClassSession, SourceId = SessionId).
/// </summary>
public class ClassSession
{
    public Guid SessionId { get; set; }

    public int ClassId { get; set; }

    public Class? Class { get; set; }

    /// <summary>Thứ tự buổi trong khóa (từ 1); unique với ClassId. Buổi bù đánh số tiếp ở cuối.</summary>
    public int SessionNo { get; set; }

    public int RoomId { get; set; }

    public Room? Room { get; set; }

    /// <summary>Coach thực tế của buổi (có thể khác coach mặc định khi Manager đổi, BR-54).</summary>
    public Guid CoachId { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; }

    public ClassSessionStatus Status { get; set; }

    /// <summary>Buổi bù trỏ về buổi bị hủy.</summary>
    public Guid? RescheduledFromSessionId { get; set; }

    public bool IsMakeup { get; set; }
}
