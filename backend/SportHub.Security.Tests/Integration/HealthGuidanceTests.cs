using Microsoft.Extensions.DependencyInjection;
using SportHub.AI.Application.Interfaces;

namespace SportHub.Security.Tests.Integration;

/// <summary>Gợi ý rule-based dùng hồ sơ sức khỏe tự khai: năng lượng/protein tính đúng công thức và an toàn với người thiếu cân.</summary>
[Collection(nameof(SportHubApiCollection))]
public sealed class HealthGuidanceTests(SportHubApiFactory factory)
{
    private static MemberHealthSnapshot Snapshot(
        decimal weightKg = 70m, string category = "Normal", string goalType = "FatLoss", bool complete = true,
        string? limitations = null)
        => new(28, "Female", 165m, weightKg, 25.7m, category, null, goalType, "LightlyActive", 3, 60,
            "Vegetarian", "Peanuts", limitations, complete);

    private async Task<WorkoutSuggestion> SuggestAsync(string level, MemberHealthSnapshot? health, string goal = "Get fitter")
    {
        using var scope = factory.Services.CreateScope();
        var provider = scope.ServiceProvider.GetRequiredService<IAiRecommendationService>();
        return await provider.SuggestWorkoutAsync(Guid.NewGuid(), Guid.NewGuid(), goal, level, default, "Gym", health);
    }

    [Fact]
    public async Task Fat_loss_target_uses_a_moderate_deficit_with_protein_and_dietary_tips()
    {
        // Mifflin-St Jeor nữ 28 tuổi, 165 cm, 70 kg: 1430 kcal nền, nhân 1.375 = 1966 duy trì, trừ 15% = 1671.
        var result = await SuggestAsync("Beginner", Snapshot());

        var nutrition = Assert.IsType<NutritionGuidance>(result.Nutrition);
        Assert.Equal(1966, nutrition.MaintenanceCalories);
        Assert.Equal(1671, nutrition.TargetCalories);
        Assert.Equal(112, nutrition.ProteinGramsMin);
        Assert.Equal(140, nutrition.ProteinGramsMax);
        Assert.Contains(nutrition.Tips, t => t.Contains("Vegetarian"));
        Assert.Contains(nutrition.Tips, t => t.Contains("Peanuts"));
        Assert.Contains(nutrition.Tips, t => t.Contains("not medical advice"));
    }

    [Fact]
    public async Task Underweight_member_never_gets_a_calorie_deficit()
    {
        var result = await SuggestAsync("Beginner", Snapshot(weightKg: 48m, category: "Underweight"));

        var nutrition = Assert.IsType<NutritionGuidance>(result.Nutrition);
        Assert.Equal(nutrition.MaintenanceCalories, nutrition.TargetCalories);
        Assert.Contains(nutrition.Tips, t => t.Contains("do not cut calories"));
        Assert.DoesNotContain(result.Exercises, e => e.Contains("Base cardio"));
    }

    [Fact]
    public async Task Incomplete_profile_gets_a_workout_but_no_nutrition_estimate()
    {
        var result = await SuggestAsync("Beginner", Snapshot(complete: false));

        Assert.Null(result.Nutrition);
        Assert.NotEmpty(result.Exercises);
        Assert.Contains("incomplete", result.Rationale);
    }

    [Fact]
    public async Task High_bmi_swaps_impact_exercises_and_reported_limitations_reach_the_coach()
    {
        var result = await SuggestAsync("Advanced", Snapshot(weightKg: 95m, category: "Obese", limitations: "Left knee pain"));

        Assert.DoesNotContain(result.Exercises, e => e.StartsWith("HIIT"));
        Assert.Contains(result.Exercises, e => e.StartsWith("Low-impact interval circuit"));
        Assert.Contains("Left knee pain", result.Rationale);
    }
}
