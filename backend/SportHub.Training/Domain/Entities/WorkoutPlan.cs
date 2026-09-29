using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

public class WorkoutPlan
{
    public Guid PlanId { get; set; } // PK

    public Guid MemberId { get; set; } // FK -> UserAccount (member)

    public UserAccount? Member { get; set; }

    public Guid CoachId { get; set; } // FK -> UserAccount (coach)

    public UserAccount? Coach { get; set; }

    public Guid RelationshipId { get; set; } // FK -> CoachMemberRelationship, dùng để authorize + audit

    public CoachMemberRelationship? Relationship { get; set; }

    public string Goal { get; set; } = string.Empty; // snapshot mục tiêu tại thời điểm lập plan

    public string Level { get; set; } = string.Empty; // snapshot trình độ tại thời điểm lập plan

    public DateTime CreatedAt { get; set; }

    // Mới 29/09/2026 (BE-4) — archive thay hard delete cho plan đã giao/dùng làm nguồn homework.
    public WorkoutPlanStatus Status { get; set; }

    public DateTime UpdatedAt { get; set; }

    public int Version { get; set; } // optimistic concurrency token — update items trong 1 transaction

    public ICollection<WorkoutPlanItem> Items { get; set; } = new List<WorkoutPlanItem>();

    public ICollection<HomeworkAssignment> HomeworkAssignments { get; set; } = new List<HomeworkAssignment>();
}
