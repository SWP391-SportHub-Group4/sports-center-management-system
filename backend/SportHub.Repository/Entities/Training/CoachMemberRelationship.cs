using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Ghi nhận AI là HLV phụ trách AI, và VÌ SAO (qua lớp học, cá nhân, hay Manager
// gán tay) — cần thiết vì 1 Coach chỉ được tạo Workout Plan / xem thông tin của
// Member mà mình thực sự phụ trách (BR-23/BR-24), không phải mọi Member.
public class CoachMemberRelationship
{
    public Guid RelationshipId { get; set; }

    public Guid CoachId { get; set; }

    public UserAccount? Coach { get; set; }

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    // CLASS_BASED/PERSONAL/ASSIGNED_BY_MANAGER — nguồn gốc quan hệ, dùng để
    // audit/giải trình sao có quyền truy cập.
    public RelationshipSourceType SourceType { get; set; }

    // Nullable — nếu quan hệ phát sinh từ 1 lớp cụ thể (CLASS_BASED) thì trỏ tới lớp đó.
    public int? ClassId { get; set; }

    public Class? Class { get; set; }

    // ACTIVE/ENDED — chỉ quan hệ ACTIVE mới cho phép Coach thao tác trên Member đó
    // (ràng buộc #7: không được có 2 quan hệ ACTIVE trùng).
    public RelationshipStatus Status { get; set; }

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public ICollection<WorkoutPlan> WorkoutPlans { get; set; } = new List<WorkoutPlan>();
}
