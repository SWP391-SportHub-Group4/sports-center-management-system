using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Domain.Entities;

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

    // BR-51: trần sức chứa = MIN(Room.Capacity, Class.Capacity) TẠI THỜI ĐIỂM TẠO buổi,
    // không bao giờ tính lại. Giữ riêng khỏi Capacity vì sau khi Manager giảm Capacity xuống
    // thì không còn gì cho biết trần gốc là bao nhiêu; và nếu tính lại MIN sau này, việc
    // catalog tăng sức chứa sẽ NỚI trần của buổi cũ — đúng điều BR-51 cấm.
    public int BaselineCapacity { get; set; }

    public int Capacity { get; set; } // sức chứa đang áp dụng, luôn 0 < Capacity <= BaselineCapacity

    public int ConfirmedCount { get; set; } // denormalized, tăng/giảm nguyên tử theo Enrollment

    public ClassSessionStatus Status { get; set; } // Scheduled/Rescheduled/Cancelled/Completed

    public Guid? RescheduledFromSessionId { get; set; } // FK self, trỏ về buổi gốc nếu do dời lịch

    public ClassSession? RescheduledFromSession { get; set; }

    public ICollection<Enrollment> Enrollments { get; set; } = new List<Enrollment>();
}
