using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Infrastructure;

/// <summary>
/// Bản cài đặt <see cref="IAiRecommendationService"/> chạy hoàn toàn cục bộ, theo luật.
///
/// Chọn cách này cho MVP vì: (a) chạy được ngay, không cần API key hay mạng, nên demo và test
/// không phụ thuộc dịch vụ ngoài; (b) kết quả TẤT ĐỊNH nên viết được test khẳng định; (c) đổi
/// sang LLM thật chỉ là thay bản cài đặt của interface này, phần kiểm tra BR-26/BR-27 ở
/// WorkoutRecommendationService không đổi.
///
/// KHÔNG phải là mô hình học máy và không tự nhận là như vậy — đây là bộ luật đọc được,
/// không đưa ra lời khuyên y tế (cùng tinh thần giới hạn phạm vi của BR-29).
/// </summary>
public sealed class RuleBasedAiRecommendationService(ISportHubDbContext db, IClock clock)
    : IAiRecommendationService
{
    private const int HistoryWindowDays = 30;

    // Ngân hàng bài tập theo trình độ. Giữ trong code chứ không đưa vào DB: đây là tri thức
    // của thuật toán gợi ý, không phải dữ liệu vận hành mà người dùng chỉnh sửa.
    private static readonly IReadOnlyDictionary<string, WorkoutSuggestedExercise[]> BaseByLevel =
        new Dictionary<string, WorkoutSuggestedExercise[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["Beginner"] =
            [
                new("Full-body warm-up", 1, 1, "Continue for 8 minutes."),
                new("Bodyweight squat", 3, 12),
                new("Knee push-up", 3, 10),
                new("Plank", 3, 1, "Hold for 30 seconds per rep."),
                new("Brisk or incline walk", 1, 1, "Continue for 15 minutes.")
            ],
            ["Intermediate"] =
            [
                new("Dynamic warm-up", 1, 1, "Continue for 10 minutes."),
                new("Barbell squat", 4, 8),
                new("Standard push-up", 4, 12),
                new("Dumbbell row", 4, 10, "Reps are per side."),
                new("Advanced plank", 3, 1, "Hold for 45 seconds per rep."),
                new("Running intervals", 6, 1, "Run for 1 minute per set.")
            ],
            ["Advanced"] =
            [
                new("Dynamic warm-up and core activation", 1, 1, "Continue for 12 minutes."),
                new("Barbell squat", 5, 5, "Coach adjusts the load to the member's ability."),
                new("Deadlift", 4, 5),
                new("Pull-up", 4, 8),
                new("Overhead press", 4, 8),
                new("HIIT", 8, 1, "Work for 40 seconds and rest for 20 seconds per set.")
            ]
        };

    private static readonly string[] GoalKeywordsWeightLoss = ["giảm cân", "giảm mỡ", "weight loss", "fat"];
    private static readonly string[] GoalKeywordsMuscle = ["tăng cơ", "cơ bắp", "muscle", "bulk", "tăng cân"];
    private static readonly string[] GoalKeywordsFlexibility = ["dẻo", "linh hoạt", "yoga", "flexib", "giãn"];

    public async Task<WorkoutSuggestion> SuggestWorkoutAsync(
        Guid memberId,
        Guid coachId,
        string goal,
        string level,
        CancellationToken cancellationToken = default,
        string sport = "Gym",
        MemberHealthSnapshot? health = null)
    {
        var sinceUtc = clock.UtcNow.AddDays(-HistoryWindowDays);

        var present = await db.Set<Attendance>()
            .CountAsync(
                a => a.Enrollment!.MemberId == memberId
                     && a.Session!.StartAtUtc >= sinceUtc
                     && a.Status == AttendanceStatus.Present,
                cancellationToken);

        var missed = await db.Set<Attendance>()
            .CountAsync(
                a => a.Enrollment!.MemberId == memberId
                     && a.Session!.StartAtUtc >= sinceUtc
                     && a.Status == AttendanceStatus.Absent,
                cancellationToken);

        var gymCheckIns = await db.Set<GymCheckIn>()
            .CountAsync(g => g.MemberId == memberId && g.CheckInTime >= sinceUtc, cancellationToken);

        var remainingSessions = await db.Set<MemberPackage>()
            .Where(mp => mp.MemberId == memberId && mp.Status == MemberPackageStatus.Active)
            .SumAsync(mp => (int?)(mp.RemainingSessions ?? 0), cancellationToken) ?? 0;

        var exercises = new List<WorkoutSuggestedExercise>(
            BaseByLevel.TryGetValue(level, out var baseSet) ? baseSet : BaseByLevel["Beginner"]);

        if (!sport.Equals("Gym", StringComparison.OrdinalIgnoreCase))
        {
            var sets = level.Equals("Advanced", StringComparison.OrdinalIgnoreCase) ? 4
                : level.Equals("Intermediate", StringComparison.OrdinalIgnoreCase) ? 3 : 2;
            exercises = sport.Equals("Pickleball", StringComparison.OrdinalIgnoreCase)
                ? [new("Pickleball dynamic warm-up", 1, 1, "Move lightly and warm up for 8 minutes."),
                   new("Ready-position and split-step", sets, 10, "Practice balanced stance and quick recovery."),
                   new("Dink control at kitchen line", sets, 12, "Practice controlled soft shots on both sides."),
                   new("Third-shot drop", sets, 10, "Hit controlled drops from the baseline."),
                   new("Serve and return placement", sets, 10, "Alternate deuce and ad courts; prioritize accuracy."),
                   new("Lateral court movement", sets, 8, "Return to ready position after each direction."),
                   new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")]
                : sport.Equals("Badminton", StringComparison.OrdinalIgnoreCase)
                ? [new("Badminton warm-up", 1, 1, "Move lightly and warm up joints for 8 minutes."),
                   new("Six-corner footwork", sets, 6, "Move to a corner and return to court center per rep."),
                   new("Short serve", sets, 10), new("Deep clear", sets, 10),
                   new("Net drop", sets, 10), new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")]
                : sport.Equals("Basketball", StringComparison.OrdinalIgnoreCase)
                ? [new("Basketball warm-up", 1, 1, "Move lightly and warm up joints for 8 minutes."),
                   new("Crossover dribble", sets, 10, "Alternate sides."),
                   new("Chest pass", sets, 12), new("Layup", sets, 8, "Perform on each side."),
                   new("Close-range shot", sets, 10), new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")]
                : [new($"{sport} warm-up", 1, 1, "Warm up for 8 minutes."),
                   new("Movement and coordination", sets, 10, "Practice sport-appropriate movement with a coach."),
                   new("Balance and stability", sets, 10, "Work at a comfortable intensity."),
                   new("Basic skill repetitions", sets, 10, "Coach should select drills appropriate to this sport."),
                   new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")];
        }

        // Thời lượng mỗi buổi ngắn: giữ khởi động và các bài đầu của bộ nền; bài theo mục tiêu thêm sau đó.
        if (sport == "Gym" && health?.SessionMinutes is { } minutes && minutes < 40 && exercises.Count > 4)
        {
            exercises = exercises.Take(4).ToList();
        }

        var goalLower = goal.ToLowerInvariant();
        var goalType = health?.GoalType;
        var wantsFatLoss = goalType == nameof(TrainingGoalType.FatLoss) || GoalKeywordsWeightLoss.Any(goalLower.Contains);
        var wantsMuscle = goalType == nameof(TrainingGoalType.MuscleGain) || GoalKeywordsMuscle.Any(goalLower.Contains);
        var wantsFlexibility = goalType == nameof(TrainingGoalType.Flexibility) || GoalKeywordsFlexibility.Any(goalLower.Contains);
        var underweight = health?.BmiCategory == BodyMetrics.Underweight;
        var obese = health?.BmiCategory == BodyMetrics.Obese;

        if (sport == "Gym" && wantsFatLoss && !underweight)
        {
            exercises.Add(new("Base cardio", 1, 1, "Continue for 25 minutes; coach adjusts intensity."));
            exercises.Add(new("Full-body circuit", 3, 1, "One circuit per set; rest 45 seconds between sets."));
        }

        if (sport == "Gym" && wantsMuscle)
        {
            exercises.Add(new("Hip thrust", 3, 10));
            exercises.Add(new("Face pull", 3, 15));
        }

        if (sport == "Gym" && wantsFlexibility)
        {
            exercises.Add(new("Cool-down stretch", 1, 1, "Continue for 15 minutes."));
            exercises.Add(new("Hip and shoulder mobility", 1, 1, "Continue for 10 minutes."));
        }

        // BMI cao: thay bài tác động mạnh lên khớp bằng bài tác động thấp để Coach duyệt lại khối lượng.
        if (obese)
        {
            exercises = [.. exercises.Select(e => e.Exercise switch
            {
                "Running intervals" => new WorkoutSuggestedExercise("Stationary bike intervals", e.Sets, 1,
                    "Low impact: ride hard for 1 minute per set."),
                "HIIT" => new WorkoutSuggestedExercise("Low-impact interval circuit", e.Sets, 1,
                    "Work for 40 seconds and rest for 20 seconds per set; avoid jumping."),
                _ => e
            })];
        }

        var totalActivity = present + gymCheckIns;
        var rationale = $"Sport: {sport}. " + BuildRationale(goal, level, present, missed, gymCheckIns, remainingSessions);

        // Tần suất thấp: ghi lưu ý giảm khối lượng để coach duyệt trong phần giải thích,
        // không biến lời khuyên thành một bài tập không có sets/reps.
        if (totalActivity < 4)
        {
            rationale += " Recent activity is low: coach should consider a reduced training volume when restarting.";
        }

        if (missed >= 3)
        {
            rationale += " The member missed several sessions: consider a more suitable schedule.";
        }

        rationale += HealthRationale(health);
        var nutrition = sport == "Gym" ? BuildNutrition(health) : null;

        return new WorkoutSuggestion(
            exercises.Select(item => $"{item.Exercise} {item.Sets}x{item.Reps}"
                + (string.IsNullOrWhiteSpace(item.Notes) ? string.Empty : $" · {item.Notes}")).ToList(),
            rationale,
            exercises,
            nutrition);
    }

    private static string HealthRationale(MemberHealthSnapshot? h)
    {
        if (h is null || !h.ProfileComplete)
            return " The member's health profile is incomplete (body measurements, age, activity level or schedule): "
                   + "ask the member to complete it for a more tailored plan.";
        var text = $" Body profile: BMI {h.Bmi} ({h.BmiCategory}), {h.ActivityLevel} lifestyle, "
                   + $"{h.TrainingDaysPerWeek} training day(s) per week"
                   + (h.SessionMinutes is { } m ? $", about {m} minutes per session." : ".");
        if (h.BmiCategory == BodyMetrics.Underweight)
            text += " BMI is below 18.5: avoid extra fat-loss cardio and consider medical advice.";
        else if (h.BmiCategory == BodyMetrics.Obese)
            text += " BMI is 30 or above: low-impact options were used; coach should review joint load.";
        if (!string.IsNullOrWhiteSpace(h.Limitations))
            text += $" Reported limitations or conditions: \"{h.Limitations}\". Coach must adapt or exclude affected exercises.";
        return text;
    }

    /// <summary>Ước tính năng lượng (Mifflin-St Jeor x mức vận động) và protein theo mục tiêu; chỉ chạy khi hồ sơ đủ dữ liệu.</summary>
    private static NutritionGuidance? BuildNutrition(MemberHealthSnapshot? h)
    {
        if (h is null || !h.ProfileComplete || h.Age is not { } age || h.HeightCm is not { } height || h.WeightKg is not { } weight
            || !Enum.TryParse<BiologicalSex>(h.Sex, out var sex) || !Enum.TryParse<ActivityLevel>(h.ActivityLevel, out var activity))
            return null;

        var bmr = BodyMetrics.Bmr(sex, age, height, weight);
        var maintenance = (int)Math.Round(bmr * BodyMetrics.ActivityFactor(activity), MidpointRounding.AwayFromZero);
        var underweight = h.BmiCategory == BodyMetrics.Underweight;
        var tips = new List<string>();
        int target;
        decimal proteinLow, proteinHigh;
        switch (h.GoalType)
        {
            case nameof(TrainingGoalType.FatLoss) when !underweight:
                // Thâm hụt vừa phải 15%, không xuống dưới năng lượng nền để tránh ăn quá ít.
                target = Math.Max((int)Math.Round(maintenance * 0.85m), bmr);
                (proteinLow, proteinHigh) = (1.6m, 2.0m);
                tips.Add("A moderate deficit of about 15% supports steady fat loss; aim for roughly 0.25 to 0.5 kg per week.");
                break;
            case nameof(TrainingGoalType.MuscleGain):
                target = (int)Math.Round(maintenance * 1.10m);
                (proteinLow, proteinHigh) = (1.6m, 2.2m);
                tips.Add("A small surplus of about 10% with progressive strength training supports muscle gain.");
                break;
            default:
                target = maintenance;
                (proteinLow, proteinHigh) = (1.2m, 1.6m);
                tips.Add("Eat near maintenance and keep a consistent daily routine.");
                break;
        }

        if (underweight)
            tips.Add("BMI is below 18.5: do not cut calories. Speak with a doctor or dietitian before changing your diet.");
        if (h.TargetWeightKg is { } goalWeight)
            tips.Add($"Target weight is {goalWeight} kg; review progress every 2 to 4 weeks and adjust calories with your coach.");
        tips.Add(h.DietaryPreference switch
        {
            nameof(DietaryPreference.Vegetarian) => "Vegetarian: get protein from eggs, dairy, legumes, tofu and tempeh.",
            nameof(DietaryPreference.Vegan) => "Vegan: combine legumes, tofu, tempeh, seitan and soy products; consider a vitamin B12 supplement.",
            nameof(DietaryPreference.Pescatarian) => "Pescatarian: use fish and seafood, eggs, dairy and legumes for protein.",
            nameof(DietaryPreference.Halal) => "Halal: choose halal-certified meat and check processed foods and gelatin.",
            _ => "Spread protein across 3 to 4 meals and include vegetables with most meals."
        });
        if (!string.IsNullOrWhiteSpace(h.FoodAllergies))
            tips.Add($"Allergies or intolerances reported: \"{h.FoodAllergies}\". Exclude these foods and verify any meal plan with a dietitian.");
        tips.Add("This is a general estimate for the coach to review, not medical advice or a meal plan.");

        return new NutritionGuidance(maintenance, target,
            (int)Math.Round(weight * proteinLow, MidpointRounding.AwayFromZero),
            (int)Math.Round(weight * proteinHigh, MidpointRounding.AwayFromZero), tips);
    }

    private static string BuildRationale(
        string goal, string level, int present, int missed, int gymCheckIns, int remainingSessions)
        => $"This suggestion uses the member's goal (\"{goal}\"), level ({level}), and activity over the last {HistoryWindowDays} days: "
           + $"{present} attended class sessions, {missed} missed sessions, and {gymCheckIns} gym check-ins. "
           + $"The member has {remainingSessions} sessions remaining in active packages. "
           + "This rule-based suggestion is for the coach to review and is not medical advice.";
}
