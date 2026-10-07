namespace SportHub.Training.Domain.Rules;

/// <summary>
/// Quy tắc thuần cho PtSession — tách khỏi service để test không cần DB (cùng tinh thần
/// SportHub.Scheduling.Domain.Rules.SessionRules, nhưng PT dùng deadline 24 giờ, không phải 30
/// phút của Yoga/Group X).
/// </summary>
public static class PtSessionRules
{
    public const int SessionDurationMinutes = 90;

    public const int ChangeDeadlineHours = 24;

    // Chính sách Member tự đặt lịch (BE G05). Giữ ở đây để mọi nơi dùng cùng một bộ số; có thể chuyển thành system setting sau.

    /// <summary>Bước lưới giờ bắt đầu theo giờ địa phương: chỉ xx:00 và xx:30.</summary>
    public const int SlotStepMinutes = 30;

    /// <summary>Đặt tự phục vụ phải cách hiện tại tối thiểu từng này giờ, để Coach và phòng kịp chuẩn bị.</summary>
    public const int SelfBookMinLeadHours = 12;

    /// <summary>Chỉ đặt trước tối đa từng này ngày.</summary>
    public const int SelfBookMaxAdvanceDays = 30;

    /// <summary>Mỗi lần xem khung trống tối đa từng này ngày (giữ truy vấn nhỏ và giao diện gọn).</summary>
    public const int MaxAvailabilityRangeDays = 14;

    public static DateTime EndAtUtc(DateTime startAtUtc) => startAtUtc.AddMinutes(SessionDurationMinutes);

    public static DateTime ChangeDeadline(DateTime sessionStartAtUtc)
        => sessionStartAtUtc.AddHours(-ChangeDeadlineHours);

    /// <summary>Đúng hạn khi yêu cầu được gửi tại hoặc trước deadline (biên inclusive).</summary>
    public static PtSessionTimingClassification ClassifyTiming(DateTime requestedAtUtc, DateTime sessionStartAtUtc)
        => requestedAtUtc <= ChangeDeadline(sessionStartAtUtc)
            ? PtSessionTimingClassification.OnTime
            : PtSessionTimingClassification.Late;

    /// <summary>Giao nhau nửa-mở [start, end) — hai buổi chạm biên (A kết thúc đúng lúc B bắt đầu) được phép.</summary>
    public static bool Overlaps(DateTime startA, DateTime endA, DateTime startB, DateTime endB)
        => startA < endB && startB < endA;
}
