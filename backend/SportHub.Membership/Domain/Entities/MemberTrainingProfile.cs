using SportHub.Identity.Domain.Entities;

namespace SportHub.Membership.Domain.Entities;

public class MemberTrainingProfile
{
    public Guid ProfileId { get; set; } // PK

    public Guid MemberId { get; set; } // FK -> UserAccount, unique (1-1)

    public UserAccount? Member { get; set; }

    public string Goal { get; set; } = string.Empty; // input cho AI suggestion + Coach lập plan

    public ExperienceLevel ExperienceLevel { get; set; } // Beginner/Intermediate/Advanced

    public string? Notes { get; set; } // chấn thương, hạn chế...

    public DateTime UpdatedAt { get; set; } // biết hồ sơ có đang cũ/stale không

    // ---- Hồ sơ sức khỏe do hội viên TỰ khai (thay cho lịch đo tại trung tâm). Cột nullable vì hồ sơ cũ chưa có;
    // lần lưu mới bắt buộc đủ các trường cần cho gợi ý AI (xem MemberTrainingProfileService).
    public TrainingGoalType? GoalType { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    public BiologicalSex? Sex { get; set; }

    public decimal? HeightCm { get; set; }

    public decimal? WeightKg { get; set; }
    public string? BodyBuild { get; set; }

    public decimal? TargetWeightKg { get; set; }

    public ActivityLevel? ActivityLevel { get; set; }

    public int? TrainingDaysPerWeek { get; set; }

    public int? SessionMinutes { get; set; }

    public DietaryPreference DietaryPreference { get; set; }

    public string? FoodAllergies { get; set; }
}
