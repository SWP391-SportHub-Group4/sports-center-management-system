namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Từng bài tập cụ thể trong 1 kế hoạch — tách bảng con vì 1 plan có nhiều bài
// tập (1–N).
public class WorkoutPlanItem
{
    public Guid ItemId { get; set; }

    public Guid PlanId { get; set; }

    public WorkoutPlan? Plan { get; set; }

    public string Exercise { get; set; } = string.Empty;

    public int Sets { get; set; }

    public int Reps { get; set; }

    // Ghi chú thêm (tempo, nghỉ giữa hiệp...).
    public string? Notes { get; set; }
}
