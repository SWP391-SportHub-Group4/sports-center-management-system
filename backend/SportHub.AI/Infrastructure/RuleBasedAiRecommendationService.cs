using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
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
        string sport = "Gym")
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

        if (sport != "Gym")
        {
            var sets = level.Equals("Advanced", StringComparison.OrdinalIgnoreCase) ? 4
                : level.Equals("Intermediate", StringComparison.OrdinalIgnoreCase) ? 3 : 2;
            exercises = sport == "Badminton"
                ? [new("Badminton warm-up", 1, 1, "Move lightly and warm up joints for 8 minutes."),
                   new("Six-corner footwork", sets, 6, "Move to a corner and return to court center per rep."),
                   new("Short serve", sets, 10), new("Deep clear", sets, 10),
                   new("Net drop", sets, 10), new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")]
                : [new("Basketball warm-up", 1, 1, "Move lightly and warm up joints for 8 minutes."),
                   new("Crossover dribble", sets, 10, "Alternate sides."),
                   new("Chest pass", sets, 12), new("Layup", sets, 8, "Perform on each side."),
                   new("Close-range shot", sets, 10), new("Cool-down stretch", 1, 1, "Continue for 5 minutes.")];
        }

        var goalLower = goal.ToLowerInvariant();

        if (sport == "Gym" && GoalKeywordsWeightLoss.Any(goalLower.Contains))
        {
            exercises.Add(new("Base cardio", 1, 1, "Continue for 25 minutes; coach adjusts intensity."));
            exercises.Add(new("Full-body circuit", 3, 1, "One circuit per set; rest 45 seconds between sets."));
        }

        if (sport == "Gym" && GoalKeywordsMuscle.Any(goalLower.Contains))
        {
            exercises.Add(new("Hip thrust", 3, 10));
            exercises.Add(new("Face pull", 3, 15));
        }

        if (sport == "Gym" && GoalKeywordsFlexibility.Any(goalLower.Contains))
        {
            exercises.Add(new("Cool-down stretch", 1, 1, "Continue for 15 minutes."));
            exercises.Add(new("Hip and shoulder mobility", 1, 1, "Continue for 10 minutes."));
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

        return new WorkoutSuggestion(
            exercises.Select(item => $"{item.Exercise} {item.Sets}x{item.Reps}"
                + (string.IsNullOrWhiteSpace(item.Notes) ? string.Empty : $" · {item.Notes}")).ToList(),
            rationale,
            exercises);
    }

    private static string BuildRationale(
        string goal, string level, int present, int missed, int gymCheckIns, int remainingSessions)
        => $"This suggestion uses the member's goal (\"{goal}\"), level ({level}), and activity over the last {HistoryWindowDays} days: "
           + $"{present} attended class sessions, {missed} missed sessions, and {gymCheckIns} gym check-ins. "
           + $"The member has {remainingSessions} sessions remaining in active packages. "
           + "This rule-based suggestion is for the coach to review and is not medical advice.";
}
