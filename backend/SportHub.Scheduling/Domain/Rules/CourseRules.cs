using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Domain.Rules;

/// <summary>Một buổi được sinh từ lịch lặp, mốc UTC.</summary>
public sealed record GeneratedSession(int SessionNo, DateTime StartAtUtc, DateTime EndAtUtc);

/// <summary>
/// Quy tắc thuần của khóa học nhóm (không chạm DB): giá, chi phí, ngưỡng hoàn vốn, sinh lịch buổi từ StartDate + NumSessions +
/// lịch lặp theo tuần. Không còn rule Yoga/GroupX, khung sáng/chiều, giới hạn buổi/ngày hay hạn hủy 30 phút của mô hình cũ.
/// </summary>
public static class CourseRules
{
    public const int MaxNumSessions = 100;

    /// <summary>BR-113: giá dương và bội số 1.000 VND.</summary>
    public static void ValidatePrice(decimal price)
    {
        if (price <= 0 || price % 1000 != 0)
        {
            throw new BadRequestException("invalid_price", "Giá khóa phải dương và là bội số của 1.000 VND (BR-113).");
        }
    }

    /// <summary>BR-118: chi phí do Manager nhập tay, không âm.</summary>
    public static void ValidateCost(decimal cost)
    {
        if (cost < 0)
        {
            throw new BadRequestException("invalid_cost", "Chi phí khóa không được âm.");
        }
    }

    public static void ValidateNumSessions(int numSessions)
    {
        if (numSessions < 1 || numSessions > MaxNumSessions)
        {
            throw new BadRequestException("invalid_num_sessions", $"Số buổi phải từ 1 đến {MaxNumSessions}.");
        }
    }

    /// <summary>BR-51: 0 &lt; capacity ≤ sức chứa mặc định của môn (nếu môn có đặt) và ≤ sức chứa của phòng.</summary>
    public static void ValidateCapacity(int capacity, int? sportMaxCapacity, int roomCapacity)
    {
        if (capacity < 1)
        {
            throw new BadRequestException("invalid_capacity", "Sức chứa phải lớn hơn 0.");
        }

        if (sportMaxCapacity is int max && capacity > max)
        {
            throw new BadRequestException("capacity_exceeds_sport_limit", $"Sức chứa vượt mức tối đa của môn ({max}).");
        }

        if (capacity > roomCapacity)
        {
            throw new BadRequestException("capacity_exceeds_room", $"Sức chứa vượt sức chứa của phòng ({roomCapacity}).");
        }
    }

    /// <summary>ceil(cost / price) bằng decimal — không dùng double để tránh sai số ở biên.</summary>
    public static int BreakEvenThreshold(decimal cost, decimal price)
    {
        if (price <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(price), "Giá phải dương.");
        }

        return (int)decimal.Ceiling(cost / price);
    }

    /// <summary>
    /// Sinh đúng <paramref name="numSessions"/> buổi, duyệt từng ngày từ <paramref name="startDate"/> theo thứ tự thời gian, mỗi ngày
    /// lấy các quy tắc khớp thứ (theo giờ tăng dần). Buổi đầu bắt buộc rơi đúng <paramref name="startDate"/>.
    /// </summary>
    public static IReadOnlyList<GeneratedSession> GenerateSessions(
        DateOnly startDate,
        int numSessions,
        IReadOnlyCollection<(int DayOfWeek, TimeOnly StartTimeLocal)> rules,
        int sessionMinutes)
    {
        if (rules.Count == 0)
        {
            throw new BadRequestException("schedule_rules_required", "Khóa phải có ít nhất một quy tắc lịch lặp theo tuần.");
        }

        if (sessionMinutes <= 0)
        {
            throw new BadRequestException("sport_session_minutes_missing", "Môn chưa cấu hình thời lượng buổi mặc định.");
        }

        var byDay = rules
            .GroupBy(r => r.DayOfWeek)
            .ToDictionary(g => g.Key, g => g.Select(r => r.StartTimeLocal).OrderBy(t => t).ToList());

        if (!byDay.ContainsKey((int)startDate.DayOfWeek))
        {
            throw new BadRequestException(
                "start_date_not_on_schedule", "Ngày bắt đầu phải trùng một thứ có trong lịch lặp của khóa.");
        }

        var sessions = new List<GeneratedSession>(numSessions);
        var date = startDate;

        // Mỗi tuần có ít nhất một buổi (đã kiểm ở trên) nên vòng lặp luôn kết thúc; chặn cứng để không treo nếu dữ liệu hỏng.
        var guardDays = numSessions * 8 + 14;

        for (var i = 0; i < guardDays && sessions.Count < numSessions; i++, date = date.AddDays(1))
        {
            if (!byDay.TryGetValue((int)date.DayOfWeek, out var times))
            {
                continue;
            }

            foreach (var time in times)
            {
                if (sessions.Count == numSessions)
                {
                    break;
                }

                var startLocal = date.ToDateTime(time);
                var startUtc = VietnamTime.ToUtc(startLocal);
                sessions.Add(new GeneratedSession(sessions.Count + 1, startUtc, startUtc.AddMinutes(sessionMinutes)));
            }
        }

        return sessions;
    }
}
