using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class ClassSession
{
    public Guid SessionId { get; set; } // PK

    public int ClassId { get; set; } // FK -> Class

    public Class? Class { get; set; }

    public int? RecurrenceId { get; set; } // FK -> ClassRecurrence, null = ad-hoc hoặc đã tách khỏi pattern

    public ClassRecurrence? Recurrence { get; set; }

    public int RoomId { get; set; } // FK -> Room, phòng thực tế (có thể khác default)

    public Room? Room { get; set; }

    public Guid CoachId { get; set; } // FK -> UserAccount, HLV thực tế (có thể khác default)

    public UserAccount? Coach { get; set; }

    public DateTime StartAtUtc { get; set; } // mốc tuyệt đối, check trùng lịch/No-show

    public DateTime EndAtUtc { get; set; }

    public int Capacity { get; set; } // sức chứa thực tế, <= MIN(Room, Class)

    public int ConfirmedCount { get; set; } // denormalized, tăng/giảm nguyên tử theo Enrollment

    public ClassSessionStatus Status { get; set; } // Scheduled/Rescheduled/Cancelled/Completed

    public Guid? RescheduledFromSessionId { get; set; } // FK self, trỏ về buổi gốc nếu do dời lịch

    public ClassSession? RescheduledFromSession { get; set; }

    public ICollection<Enrollment> Enrollments { get; set; } = new List<Enrollment>();
}
