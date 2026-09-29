namespace SportHub.Scheduling.Domain.Entities;

/// <summary>
/// Lịch lặp theo tuần của khóa (BR-13): thứ + giờ bắt đầu địa phương. Thời lượng buổi lấy từ môn
/// (<c>sports.default_session_minutes</c>). Chỉ dùng để sinh ClassSession khi publish; sau đó lịch thật nằm ở ClassSession.
/// </summary>
public class ClassScheduleRule
{
    public int RuleId { get; set; }

    public int ClassId { get; set; }

    public Class? Class { get; set; }

    /// <summary>0 = Chủ nhật … 6 = Thứ bảy (System.DayOfWeek).</summary>
    public int DayOfWeek { get; set; }

    /// <summary>Giờ địa phương Asia/Ho_Chi_Minh.</summary>
    public TimeOnly StartTimeLocal { get; set; }
}
