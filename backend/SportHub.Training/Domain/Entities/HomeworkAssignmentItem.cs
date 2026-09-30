namespace SportHub.Training.Domain.Entities;

/// <summary>Mới 29/09/2026 (BE-4). Snapshot bài tập tại thời điểm giao — tách bảng con như WorkoutPlanItem.</summary>
public class HomeworkAssignmentItem
{
    public Guid ItemId { get; set; } // PK

    public Guid AssignmentId { get; set; } // FK -> HomeworkAssignment

    public HomeworkAssignment? Assignment { get; set; }

    public string Exercise { get; set; } = string.Empty;

    public int Sets { get; set; }

    public int Reps { get; set; }

    public string? Notes { get; set; }
}
