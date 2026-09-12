namespace SportHub.Repository.Entities.Training;

public class CoachMemberRelationship
{
    public Guid RelationshipId { get; set; } // PK

    public Guid CoachId { get; set; } // FK -> UserAccount (coach)

    public UserAccount? Coach { get; set; }

    public Guid MemberId { get; set; } // FK -> UserAccount (member)

    public UserAccount? Member { get; set; }

    public RelationshipSourceType SourceType { get; set; } // ClassBased/Personal/AssignedByManager

    public int? ClassId { get; set; } // FK -> Class, chỉ có khi SourceType = ClassBased

    public Class? Class { get; set; }

    public RelationshipStatus Status { get; set; } // Active/Ended — chỉ 1 Active/cặp Coach-Member

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public ICollection<WorkoutPlan> WorkoutPlans { get; set; } = new List<WorkoutPlan>();
}
