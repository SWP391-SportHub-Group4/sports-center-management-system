using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Mới 29/09/2026 (BE-4). Bài tập về nhà PT giao — nguồn dữ liệu thật thay vì dùng chuỗi
/// Notification làm nguồn. Chỉ PT có quan hệ Active với Member mới tạo/sửa/hủy/review; Member
/// chỉ đọc và cập nhật InProgress/Completed + feedback của chính mình; relationship kết thúc
/// không xóa homework cũ, chỉ chặn assignment mới.
/// </summary>
public class HomeworkAssignment
{
    public Guid AssignmentId { get; set; } // PK

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    public Guid CoachId { get; set; }

    public UserAccount? Coach { get; set; }

    public Guid RelationshipId { get; set; } // FK -> CoachMemberRelationship, đúng quan hệ đang Active

    public CoachMemberRelationship? Relationship { get; set; }

    public Guid? SourceWorkoutPlanId { get; set; } // snapshot từ WorkoutPlan nếu có, không đồng bộ ngược

    public WorkoutPlan? SourceWorkoutPlan { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? CoachNote { get; set; }

    public DateTime AssignedAt { get; set; }

    public DateTime DueAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public HomeworkAssignmentStatus Status { get; set; }

    public string? MemberFeedback { get; set; } // chỉ Member sửa, PT không sửa

    public int Version { get; set; } // optimistic concurrency token

    public ICollection<HomeworkAssignmentItem> Items { get; set; } = new List<HomeworkAssignmentItem>();
}
