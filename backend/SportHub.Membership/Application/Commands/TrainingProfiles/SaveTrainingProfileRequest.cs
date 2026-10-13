using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Application.Commands;

/// <summary>
/// Hồ sơ sức khỏe và mục tiêu do hội viên tự khai, là đầu vào cho gợi ý bài tập/dinh dưỡng (BR-26). Chiều cao,
/// cân nặng, ngày sinh, giới tính và mức vận động bắt buộc vì thiếu thì không ước tính được BMI và năng lượng.
/// </summary>
public sealed class SaveTrainingProfileRequest
{
    /// <summary>Mô tả mục tiêu bằng lời của hội viên (vd. "giảm 5 kg để thi đấu cầu lông").</summary>
    [Required, MinLength(3), MaxLength(500)]
    public string Goal { get; set; } = string.Empty;

    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string? GoalType { get; set; }

    /// <summary>Tên member của enum ExperienceLevel (SSOT §3): Beginner/Intermediate/Advanced.</summary>
    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string ExperienceLevel { get; set; } = string.Empty;

    [Required]
    public DateOnly? DateOfBirth { get; set; }

    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string? Sex { get; set; }

    [Required, Range(100d, 250d)]
    public decimal? HeightCm { get; set; }

    [Required, Range(30d, 300d)]
    public decimal? WeightKg { get; set; }
    [MaxLength(20)]
    public string? BodyBuild { get; set; }

    [Range(30d, 300d)]
    public decimal? TargetWeightKg { get; set; }

    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string? ActivityLevel { get; set; }

    [Required, Range(1, 7)]
    public int? TrainingDaysPerWeek { get; set; }

    [Range(15, 240)]
    public int? SessionMinutes { get; set; }

    [SportHub.BuildingBlocks.Api.WireEnum] public string? DietaryPreference { get; set; }

    [MaxLength(500)]
    public string? FoodAllergies { get; set; }

    /// <summary>Chấn thương, bệnh lý hoặc hạn chế vận động mà Coach cần biết.</summary>
    [MaxLength(2000)]
    public string? Notes { get; set; }
}
