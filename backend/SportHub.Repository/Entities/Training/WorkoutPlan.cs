namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Kế hoạch tập do Coach lập cho 1 Member — chỉ được tạo nếu Coach có
// CoachMemberRelationship ACTIVE với Member đó (đảm bảo đúng quyền phụ trách, BR-23).
public class WorkoutPlan
{
    public Guid plan_id { get; set; }

    public Guid member_id { get; set; }

    public UserAccount? Member { get; set; }

    public Guid coach_id { get; set; }

    public UserAccount? Coach { get; set; }

    // Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit.
    public Guid relationship_id { get; set; }

    public CoachMemberRelationship? Relationship { get; set; }

    // Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác
    // MemberTrainingProfile hiện tại nếu profile đã update sau đó).
    public string goal { get; set; } = string.Empty;

    public string level { get; set; } = string.Empty;

    public DateTime created_at { get; set; }

    public ICollection<WorkoutPlanItem> Items { get; set; } = new List<WorkoutPlanItem>();
}
