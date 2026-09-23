namespace SportHub.BuildingBlocks.SharedKernel.Time;

/// <summary>
/// Quy đổi giữa mốc UTC lưu trong DB (SSOT §5.3) và ngày/giờ địa phương Asia/Ho_Chi_Minh.
///
/// Dùng ở những chỗ nghiệp vụ nói bằng "ngày" chứ không phải "mốc thời gian": ngày bắt đầu/
/// kết thúc gói (DateOnly, quyết định C4), ngưỡng nhắc hạn gói (BR-33), và khi sinh
/// ClassSession từ giờ địa phương của ClassRecurrence (BR-15).
///
/// UTC+7 cố định, không DST — Việt Nam không đổi giờ từ 1975, nên không phụ thuộc tzdata của
/// máy chạy (Windows dùng id "SE Asia Standard Time", Linux dùng "Asia/Ho_Chi_Minh"; tra theo
/// id sẽ vỡ trên một trong hai).
/// </summary>
public static class VietnamTime
{
    public static readonly TimeSpan Offset = TimeSpan.FromHours(7);

    public static DateTime ToLocal(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified) + Offset;

    public static DateTime ToUtc(DateTime local)
        => DateTime.SpecifyKind(DateTime.SpecifyKind(local, DateTimeKind.Unspecified) - Offset, DateTimeKind.Utc);

    public static DateOnly TodayLocal(IClock clock) => DateOnly.FromDateTime(ToLocal(clock.UtcNow));

    /// <summary>Mốc UTC ứng với 00:00 giờ VN của một ngày.</summary>
    public static DateTime StartOfDayUtc(DateOnly localDate)
        => ToUtc(localDate.ToDateTime(TimeOnly.MinValue));

    /// <summary>Mốc UTC ứng với đầu ngày kế tiếp — dùng làm biên PHẢI MỞ khi lọc theo khoảng ngày.</summary>
    public static DateTime EndOfDayExclusiveUtc(DateOnly localDate)
        => ToUtc(localDate.AddDays(1).ToDateTime(TimeOnly.MinValue));
}
