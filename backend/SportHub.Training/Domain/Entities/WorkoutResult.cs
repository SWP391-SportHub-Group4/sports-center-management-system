using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Đổi FK 29/09/2026 (BE-4): EnrollmentId → PtSessionId (unique, 1–1). Yoga/Group X không có
/// WorkoutResult — PT session cũ ép qua Enrollment đã bị loại bỏ hoàn toàn.
/// </summary>
public class WorkoutResult
{
    public Guid ResultId { get; set; } // PK

    public Guid PtSessionId { get; set; } // FK -> PtSession, unique (1-1)

    public PtSession? PtSession { get; set; }

    public Guid CoachId { get; set; } // FK -> UserAccount, phải khớp PtSession.CoachId thực tế lúc ghi

    public UserAccount? Coach { get; set; }

    public string? ProgressNote { get; set; } // ghi chú tiến độ khách quan

    public string? CoachComment { get; set; } // nhận xét định tính của Coach

    public DateTime RecordedAt { get; set; }
}
