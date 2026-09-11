namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Kế hoạch tập do Coach lập cho 1 Member — chỉ được tạo nếu Coach có
// CoachMemberRelationship ACTIVE với Member đó (đảm bảo đúng quyền phụ trách, BR-23).
public class WorkoutPlan
{
    public Guid PlanId { get; set; }

    public Guid MemberId { get; set; }

    public UserAccount? Member { get; set; }

    public Guid CoachId { get; set; }

    public UserAccount? Coach { get; set; }

    // Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit.
    public Guid RelationshipId { get; set; }

    public CoachMemberRelationship? Relationship { get; set; }

    // Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác
    // MemberTrainingProfile hiện tại nếu profile đã update sau đó).
    public string Goal { get; set; } = string.Empty;

    public string Level { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public ICollection<WorkoutPlanItem> Items { get; set; } = new List<WorkoutPlanItem>();
}
