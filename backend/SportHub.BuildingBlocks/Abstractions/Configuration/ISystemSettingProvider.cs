namespace SportHub.BuildingBlocks.Abstractions.Configuration;

/// <summary>
/// Đọc cấu hình toàn hệ thống do Center Manager đặt (BR-39). Bản cài đặt ở module Administration.
/// Ở BuildingBlocks vì background jobs và các module nghiệp vụ chỉ phụ thuộc abstraction,
/// không tham chiếu trực tiếp module Administration.
/// </summary>
public interface ISystemSettingProvider
{
    Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default);
    Task<VersionedIntSetting> GetVersionedIntAsync(string key, CancellationToken cancellationToken = default);
}

public sealed record VersionedIntSetting(int Value, string Version);

public static class SystemSettingKeys
{
    /// <summary>
    /// BR-33 — nhắc trước bao nhiêu ngày khi gói sắp hết hạn. BR chỉ nêu "ví dụ: 7 ngày",
    /// nên đây là cấu hình, không phải ngưỡng đã chốt.
    /// </summary>
    public const string MembershipExpiryNoticeDays = "membership.expiry_notice_days";
    public const string PackageExpiringReminderDays = MembershipExpiryNoticeDays;

    /// <summary>BR-119 — đánh giá ngưỡng hoàn vốn trước buổi đầu bao nhiêu ngày.</summary>
    public const string ClassThresholdDaysBeforeStart = "class.threshold_days_before_start";

    /// <summary>BR-120 — Member có bao nhiêu giờ để trả lời khi lớp AtRisk.</summary>
    public const string ClassThresholdResponseHours = "class.threshold_response_hours";

    /// <summary>BR-115 — giữ chỗ/checkout tối đa bao nhiêu phút.</summary>
    public const string HoldMinutes = "hold.minutes";

    public const string PtPricePerSessionVnd = "pt.price_per_session_vnd";
    public const string PtSelfBookMinLeadHours = "pt.self_book_min_lead_hours";
    public const string PtSelfBookMaxAdvanceDays = "pt.self_book_max_advance_days";
    public const string PointsConfirmOtpMinutes = "points.confirm_otp_minutes";
    public const string RentalSlotMinutes = "rental.slot_minutes";
    public const string RentalMaxHours = "rental.max_hours";
    public const string RentalAdvanceDays = "rental.advance_days";
    public const string RentalCancelFreeHours = "rental.cancel_free_hours";
}
