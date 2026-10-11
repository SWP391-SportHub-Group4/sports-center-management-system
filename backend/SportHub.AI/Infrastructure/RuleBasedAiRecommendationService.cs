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
    private static readonly IReadOnlyDictionary<string, string[]> BaseByLevel =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["Beginner"] =
            [
                "Full-body warm-up for 8 minutes",
                "Bodyweight squat 3x12",
                "Knee push-up 3x10",
                "Plank 3x30 seconds",
                "Brisk or incline walk for 15 minutes"
            ],
            ["Intermediate"] =
            [
                "Dynamic warm-up for 10 minutes",
                "Barbell squat 4x8",
                "Standard push-up 4x12",
                "Dumbbell row 4x10 per side",
                "Advanced plank 3x45 seconds",
                "Running intervals 6x1 minute"
            ],
            ["Advanced"] =
            [
                "Dynamic warm-up for 12 minutes plus core activation",
                "Progressive barbell squat 5x5",
                "Deadlift 4x5",
                "Pull-up 4x8",
                "Overhead press 4x8",
                "HIIT 8x40 seconds with 20 seconds rest"
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
        CancellationToken cancellationToken = default)
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

        var exercises = new List<string>(
            BaseByLevel.TryGetValue(level, out var baseSet) ? baseSet : BaseByLevel["Beginner"]);

        var goalLower = goal.ToLowerInvariant();

        if (GoalKeywordsWeightLoss.Any(goalLower.Contains))
        {
            exercises.Add("Base cardio for 25 minutes at 65–75% target heart rate");
            exercises.Add("Three full-body circuit rounds with 45 seconds rest");
        }

        if (GoalKeywordsMuscle.Any(goalLower.Contains))
        {
            exercises.Add("Increase the main lift by 2.5 kg each week");
            exercises.Add("Add hip thrust 3x10 and face pull 3x15");
        }

        if (GoalKeywordsFlexibility.Any(goalLower.Contains))
        {
            exercises.Add("Finish with 15 minutes of yoga stretching");
            exercises.Add("Hip and shoulder mobility for 10 minutes");
        }

        var totalActivity = present + gymCheckIns;
        var rationale = BuildRationale(goal, level, present, missed, gymCheckIns, remainingSessions);

        // Tần suất thấp trong 30 ngày thì giảm khối lượng thay vì giữ nguyên giáo án: đây là
        // điều chỉnh theo LỊCH SỬ — chính là đầu vào thứ ba mà BR-26 yêu cầu phải dùng tới.
        if (totalActivity < 4)
        {
            exercises.Add("Note: restart at 60% training volume for the first two weeks because recent activity has been low");
        }

        if (missed >= 3)
        {
            exercises.Add("Note: consider a different class time because the member missed several registered sessions");
        }

        return new WorkoutSuggestion(exercises, rationale);
    }

    private static string BuildRationale(
        string goal, string level, int present, int missed, int gymCheckIns, int remainingSessions)
        => $"This suggestion uses the member's goal (\"{goal}\"), level ({level}), and activity over the last {HistoryWindowDays} days: "
           + $"{present} attended class sessions, {missed} missed sessions, and {gymCheckIns} gym check-ins. "
           + $"The member has {remainingSessions} sessions remaining in active packages. "
           + "This rule-based suggestion is for the coach to review and is not medical advice.";
}
