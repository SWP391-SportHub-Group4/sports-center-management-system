namespace SportHub.Repository.Entities.Training;

public class WorkoutPlanItem
{
    public Guid ItemId { get; set; } // PK

    public Guid PlanId { get; set; } // FK -> WorkoutPlan

    public WorkoutPlan? Plan { get; set; }

    public string Exercise { get; set; } = string.Empty;

    public int Sets { get; set; }

    public int Reps { get; set; }

    public string? Notes { get; set; } // tempo, nghỉ giữa hiệp...
}
