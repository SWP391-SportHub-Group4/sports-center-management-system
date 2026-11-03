namespace SportHub.AI.Application.Interfaces;

// Theo Design v2, mục 6: AI ở MVP là module trong chính backend, KHÔNG phải microservice riêng.
// Khi cần tách (scale riêng / đổi ngôn ngữ xử lý ML), chỉ cần đổi implementation của interface này
// sang gọi qua HTTP tới service Python bên ngoài — phần còn lại của backend không phải đổi.
public interface IAiRecommendationService
{
    Task<WorkoutSuggestion> SuggestWorkoutAsync(
        Guid memberId,
        Guid coachId,
        string goal,
        string level,
        CancellationToken cancellationToken = default,
        string sport = "Gym",
        MemberHealthSnapshot? health = null);
}

/// <summary>
/// Hồ sơ sức khỏe do hội viên tự khai, đã chuẩn hóa cho provider (không có định danh). Thiếu trường nào thì null và
/// provider phải bỏ qua phần phụ thuộc trường đó, không đoán giá trị.
/// </summary>
public record MemberHealthSnapshot(
    int? Age,
    string? Sex,
    decimal? HeightCm,
    decimal? WeightKg,
    decimal? Bmi,
    string? BmiCategory,
    decimal? TargetWeightKg,
    string? GoalType,
    string? ActivityLevel,
    int? TrainingDaysPerWeek,
    int? SessionMinutes,
    string DietaryPreference,
    string? FoodAllergies,
    string? Limitations,
    bool ProfileComplete);

/// <summary>Gợi ý dinh dưỡng ước tính theo công thức, để Coach xem lại; không phải thực đơn hay lời khuyên y tế.</summary>
public record NutritionGuidance(
    int? MaintenanceCalories,
    int? TargetCalories,
    int? ProteinGramsMin,
    int? ProteinGramsMax,
    IReadOnlyList<string> Tips);

public record WorkoutSuggestedExercise(string Exercise, int Sets, int Reps, string? Notes = null);

public record WorkoutSuggestion(
    IReadOnlyList<string> Exercises,
    string Rationale,
    IReadOnlyList<WorkoutSuggestedExercise>? Items = null,
    NutritionGuidance? Nutrition = null);
