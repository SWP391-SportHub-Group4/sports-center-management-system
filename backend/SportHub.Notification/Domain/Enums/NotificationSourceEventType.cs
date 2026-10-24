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
    ClassTeachingUpdated = 17,
    ClassSessionChangeRequested = 18,
    ClassSessionChangeReviewed = 19,
    PasswordChanged = 20,
    ClassEnrollmentClosed = 21,
    ClassEnrollmentReopened = 22,
    ClassThresholdConfirmed = 23,
    CoachCoverageRequired = 24,
    ClassSessionReminder = 25,
    AvatarReported = 27,
    CoachAttendanceReminder = 28,
    SupportRequestAssigned = 29,
    SupportRequestReceived = 30,
    PaymentUnactivated = 31,
    PaymentConvertedToPoints = 32,
    SupportRequestReminded = 33,
    SupportSlaReminder = 34,
    SupportPayoutRecorded = 35,
    SupportPayoutNotReceived = 36
}
