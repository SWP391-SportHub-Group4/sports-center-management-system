namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Training.
// Từng bài tập cụ thể trong 1 kế hoạch — tách bảng con vì 1 plan có nhiều bài
// tập (1–N).
public class WorkoutPlanItem
{
    public Guid item_id { get; set; }

    public Guid plan_id { get; set; }

    public WorkoutPlan? Plan { get; set; }

    public string exercise { get; set; } = string.Empty;

    public int sets { get; set; }

    public int reps { get; set; }

    // Ghi chú thêm (tempo, nghỉ giữa hiệp...).
    public string? notes { get; set; }
}
