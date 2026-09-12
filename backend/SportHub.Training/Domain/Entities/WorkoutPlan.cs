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

    public ICollection<WorkoutPlanItem> Items { get; set; } = new List<WorkoutPlanItem>();
}
