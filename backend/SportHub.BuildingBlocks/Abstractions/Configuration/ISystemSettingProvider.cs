namespace SportHub.BuildingBlocks.Abstractions.Configuration;

/// <summary>
/// Đọc cấu hình toàn hệ thống do Center Manager đặt (BR-39). Bản cài đặt ở module Administration.
///
/// Ở BuildingBlocks vì Scheduling cần <see cref="SystemSettingKeys.CancellationDeadlineHours"/>
/// (BR-50), trong khi Administration lại tham chiếu ngược nhiều module — tham chiếu trực tiếp
/// giữa hai bên sẽ thành vòng.
/// </summary>
public interface ISystemSettingProvider
{
    Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default);
}

public static class SystemSettingKeys
{
    /// <summary>
    /// BR-50 — số giờ tối thiểu trước giờ bắt đầu buổi học mà hội viên phải huỷ để được hoàn lượt.
    /// Giá trị được CHỤP vào Enrollment lúc xác nhận; đổi cấu hình không ảnh hưởng đăng ký cũ.
    /// </summary>
    public const string CancellationDeadlineHours = "cancellation_deadline_hours";

    /// <summary>
    /// BR-33 — nhắc trước bao nhiêu ngày khi gói sắp hết hạn. BR chỉ nêu "ví dụ: 7 ngày",
    /// nên đây là cấu hình, không phải ngưỡng đã chốt.
    /// </summary>
    public const string PackageExpiringReminderDays = "package_expiring_reminder_days";
}
