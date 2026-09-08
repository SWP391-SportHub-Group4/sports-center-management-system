namespace SportHub.Service.Modules.AI;

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
        CancellationToken cancellationToken = default);
}

public record WorkoutSuggestion(IReadOnlyList<string> Exercises, string Rationale);
