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
                "Khởi động toàn thân 8 phút",
                "Squat không tạ 3x12",
                "Chống đẩy quỳ gối 3x10",
                "Plank 3x30 giây",
                "Đi bộ nhanh/incline 15 phút"
            ],
            ["Intermediate"] =
            [
                "Khởi động động 10 phút",
                "Barbell squat 4x8",
                "Chống đẩy tiêu chuẩn 4x12",
                "Dumbbell row 4x10 mỗi bên",
                "Plank nâng cao 3x45 giây",
                "Interval chạy bộ 6x1 phút"
            ],
            ["Advanced"] =
            [
                "Khởi động động 12 phút + cơ lõi kích hoạt",
                "Barbell squat 5x5 tăng tiến",
                "Deadlift 4x5",
                "Pull-up 4x8",
                "Overhead press 4x8",
                "HIIT 8x40 giây / nghỉ 20 giây"
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

        var present = await db.Set<Enrollment>()
            .CountAsync(
                e => e.MemberId == memberId
                     && e.Session!.StartAtUtc >= sinceUtc
                     && e.Attendance != null
                     && e.Attendance.Status == AttendanceStatus.Present,
                cancellationToken);

        var missed = await db.Set<Enrollment>()
            .CountAsync(
                e => e.MemberId == memberId
                     && e.Session!.StartAtUtc >= sinceUtc
                     && e.Attendance != null
                     && (e.Attendance.Status == AttendanceStatus.Absent
                         || e.Attendance.Status == AttendanceStatus.NoShow),
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
            exercises.Add("Cardio nền 25 phút, nhịp tim mục tiêu 65–75%");
            exercises.Add("Circuit toàn thân 3 vòng, nghỉ 45 giây");
        }

        if (GoalKeywordsMuscle.Any(goalLower.Contains))
        {
            exercises.Add("Tăng tải 2.5kg mỗi tuần ở bài chính");
            exercises.Add("Bổ sung hip thrust 3x10 và face pull 3x15");
        }

        if (GoalKeywordsFlexibility.Any(goalLower.Contains))
        {
            exercises.Add("Chuỗi yoga giãn cơ 15 phút cuối buổi");
            exercises.Add("Mobility hông và vai 10 phút");
        }

        var totalActivity = present + gymCheckIns;
        var rationale = BuildRationale(goal, level, present, missed, gymCheckIns, remainingSessions);

        // Tần suất thấp trong 30 ngày thì giảm khối lượng thay vì giữ nguyên giáo án: đây là
        // điều chỉnh theo LỊCH SỬ — chính là đầu vào thứ ba mà BR-26 yêu cầu phải dùng tới.
        if (totalActivity < 4)
        {
            exercises.Add("Ghi chú: bắt đầu lại ở 60% khối lượng trong 2 tuần đầu vì tần suất tập 30 ngày qua còn thấp");
        }

        if (missed >= 3)
        {
            exercises.Add("Ghi chú: cân nhắc đổi khung giờ lớp — hội viên vắng nhiều buổi đã đăng ký");
        }

        return new WorkoutSuggestion(exercises, rationale);
    }

    private static string BuildRationale(
        string goal, string level, int present, int missed, int gymCheckIns, int remainingSessions)
        => $"Gợi ý dựa trên 3 đầu vào bắt buộc (BR-26): mục tiêu \"{goal}\", trình độ {level}, "
           + $"và lịch sử {HistoryWindowDays} ngày gần nhất ({present} buổi lớp có mặt, "
           + $"{missed} buổi vắng/không đến, {gymCheckIns} lần check-in Gym). "
           + $"Hội viên còn {remainingSessions} buổi trong các gói đang hoạt động. "
           + "Đây là gợi ý theo bộ luật của hệ thống để HLV tham khảo, không phải tư vấn y tế.";
}
