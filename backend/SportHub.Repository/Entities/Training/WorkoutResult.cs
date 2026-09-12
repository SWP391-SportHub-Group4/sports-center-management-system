namespace SportHub.Repository.Entities.Training;

public class WorkoutResult
{
    public Guid ResultId { get; set; } // PK

    public Guid EnrollmentId { get; set; } // FK -> Enrollment, đảm bảo Member thực sự có đăng ký session

    public Enrollment? Enrollment { get; set; }

    public Guid CoachId { get; set; } // FK -> UserAccount, ai ghi nhận kết quả

    public UserAccount? Coach { get; set; }

    public string? ProgressNote { get; set; } // ghi chú tiến độ khách quan

    public string? CoachComment { get; set; } // nhận xét định tính của Coach

    public DateTime RecordedAt { get; set; }
}
