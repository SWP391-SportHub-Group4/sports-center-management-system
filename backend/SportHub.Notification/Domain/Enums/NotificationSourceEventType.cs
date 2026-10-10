namespace SportHub.Notification.Domain.Enums;

// Sự kiện nguồn phát sinh thông báo.
public enum NotificationSourceEventType
{
    ClassCancelled,
    ScheduleChanged,
    PackageExpiring,
    PaymentReceived,
    RetiredEvent4,
    RetiredEvent5,
    ClassPublished,
    ClassThresholdAtRisk,
    RegisterOtpRequested,
    PasswordResetOtpRequested,
    // Hai giá trị 10, 11 đã ngừng dùng (ExternalCoach bị gỡ, BR-140). Giữ chỗ để không đổi số enum đã lưu.
    RetiredEvent10,
    RetiredEvent11,
    ManualNotice,
    IncidentResolution,
    PointConfirmationOtpRequested,
    InvoiceCreated = 15,
    RefundCompleted = 16,
    ClassTeachingUpdated = 17
}
