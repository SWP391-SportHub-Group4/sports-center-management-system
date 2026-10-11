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
                new("Khởi động toàn thân", 1, 1, "Thực hiện liên tục 8 phút."),
                new("Squat không tạ", 3, 12),
                new("Chống đẩy quỳ gối", 3, 10),
                new("Plank", 3, 1, "Mỗi lần giữ 30 giây; reps tính số lần giữ, không phải số giây."),
                new("Đi bộ nhanh/incline", 1, 1, "Thực hiện liên tục 15 phút.")
            ],
            ["Intermediate"] =
            [
                new("Khởi động động", 1, 1, "Thực hiện liên tục 10 phút."),
                new("Barbell squat", 4, 8),
                new("Chống đẩy tiêu chuẩn", 4, 12),
                new("Dumbbell row", 4, 10, "Số lần lặp tính cho mỗi bên."),
                new("Plank nâng cao", 3, 1, "Mỗi lần giữ 45 giây; reps tính số lần giữ, không phải số giây."),
                new("Interval chạy bộ", 6, 1, "Mỗi hiệp chạy 1 phút.")
            ],
            ["Advanced"] =
            [
                new("Khởi động động và kích hoạt cơ lõi", 1, 1, "Thực hiện liên tục 12 phút."),
                new("Barbell squat", 5, 5, "Coach điều chỉnh tải theo khả năng của học viên."),
                new("Deadlift", 4, 5),
                new("Pull-up", 4, 8),
                new("Overhead press", 4, 8),
                new("HIIT", 8, 1, "Mỗi hiệp vận động 40 giây, nghỉ 20 giây.")
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
                ? [new("Khởi động cầu lông", 1, 1, "Vận động nhẹ và khởi động khớp trong 8 phút."),
                   new("Di chuyển sáu góc sân", sets, 6, "Một lần di chuyển đến một góc rồi trở về vị trí giữa sân."),
                   new("Giao cầu ngắn", sets, 10), new("Phông cầu cuối sân", sets, 10),
                   new("Bỏ nhỏ trên lưới", sets, 10), new("Giãn cơ cuối buổi", 1, 1, "Thực hiện trong 5 phút.")]
                : [new("Khởi động bóng rổ", 1, 1, "Vận động nhẹ và khởi động khớp trong 8 phút."),
                   new("Dẫn bóng đổi tay", sets, 10, "Một lần đổi tay; thực hiện đều hai bên."),
                   new("Chuyền ngực", sets, 12), new("Lên rổ", sets, 8, "Thực hiện mỗi bên."),
                   new("Ném rổ cự ly gần", sets, 10), new("Giãn cơ cuối buổi", 1, 1, "Thực hiện trong 5 phút.")];
        }

        var goalLower = goal.ToLowerInvariant();

        if (sport == "Gym" && GoalKeywordsWeightLoss.Any(goalLower.Contains))
        {
            exercises.Add(new("Cardio nền", 1, 1, "Thực hiện liên tục 25 phút; coach điều chỉnh cường độ."));
            exercises.Add(new("Circuit toàn thân", 3, 1, "Mỗi hiệp là một vòng; nghỉ 45 giây giữa các vòng."));
        }

        if (sport == "Gym" && GoalKeywordsMuscle.Any(goalLower.Contains))
        {
            exercises.Add(new("Hip thrust", 3, 10));
            exercises.Add(new("Face pull", 3, 15));
        }

        if (sport == "Gym" && GoalKeywordsFlexibility.Any(goalLower.Contains))
        {
            exercises.Add(new("Giãn cơ cuối buổi", 1, 1, "Thực hiện liên tục 15 phút."));
            exercises.Add(new("Mobility hông và vai", 1, 1, "Thực hiện liên tục 10 phút."));
        }

        var totalActivity = present + gymCheckIns;
        var rationale = $"Bộ môn: {sport}. " + BuildRationale(goal, level, present, missed, gymCheckIns, remainingSessions);

        // Tần suất thấp: ghi lưu ý giảm khối lượng để coach duyệt trong phần giải thích,
        // không biến lời khuyên thành một bài tập không có sets/reps.
        if (totalActivity < 4)
        {
            rationale += " Tần suất tập 30 ngày qua còn thấp: coach cân nhắc giảm khối lượng khi bắt đầu lại.";
        }

        if (missed >= 3)
        {
            rationale += " Hội viên vắng nhiều buổi: cân nhắc khung giờ phù hợp hơn.";
        }

        return new WorkoutSuggestion(
            exercises.Select(item => $"{item.Exercise} {item.Sets}x{item.Reps}"
                + (string.IsNullOrWhiteSpace(item.Notes) ? string.Empty : $" · {item.Notes}")).ToList(),
            rationale,
            exercises);
    }

    private static string BuildRationale(
        string goal, string level, int present, int missed, int gymCheckIns, int remainingSessions)
        => $"Gợi ý dựa trên 3 đầu vào bắt buộc (BR-26): mục tiêu \"{goal}\", trình độ {level}, "
           + $"và lịch sử {HistoryWindowDays} ngày gần nhất ({present} buổi lớp có mặt, "
           + $"{missed} buổi vắng/không đến, {gymCheckIns} lần check-in Gym). "
           + $"Hội viên còn {remainingSessions} buổi trong các gói đang hoạt động. "
           + "Đây là gợi ý theo bộ luật của hệ thống để HLV tham khảo, không phải tư vấn y tế.";
}
