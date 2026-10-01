namespace SportHub.BuildingBlocks.Abstractions.Notifications;

/// <summary>
/// Đưa thông báo vào hàng đợi trong DB (BR-33, BR-34). Bản cài đặt ở module Notification.
///
/// BR-34: ghi vào bảng trong CÙNG transaction với hành động gốc (kiểu outbox), việc "gửi"
/// do job nền làm sau. Nhờ vậy lỗi gửi không bao giờ rollback được việc huỷ lớp hay thu tiền.
/// Cũng vì vậy hàm này KHÔNG SaveChanges và KHÔNG gọi ra ngoài mạng.
/// </summary>
public interface INotificationWriter
{
    void Queue(NotificationRequest request);

    /// <summary>Queue an encrypted email payload in the caller's transaction; never sends inline.</summary>
    void QueueEmail(EmailNotificationRequest request);
}

/// <param name="SourceEventType">Phải là một trong <see cref="NotificationEvents"/>.</param>
public sealed record NotificationRequest(
    Guid UserId,
    string SourceEventType,
    string Message,
    Guid? SourceEntityId = null);

public sealed record EmailNotificationRequest(Guid? UserId, string RecipientAddress, string SourceEventType,
    Guid SourceEntityId, string Subject, string HtmlBody);

/// <summary>
/// Tên các loại sự kiện, mirror enum NotificationSourceEventType (SSOT §3).
///
/// Nhân bản dưới dạng hằng chuỗi vì BuildingBlocks không được tham chiếu module Notification
/// để dùng enum thật. Bản cài đặt map ngược chuỗi sang enum và NÉM nếu không khớp, nên lệch
/// giữa hai nơi sẽ lộ ra ngay ở test chứ không âm thầm ghi sai loại.
/// </summary>
public static class NotificationEvents
{
    public const string ClassCancelled = nameof(ClassCancelled);
    public const string ScheduleChanged = nameof(ScheduleChanged);
    public const string PackageExpiring = nameof(PackageExpiring);
    public const string PaymentReceived = nameof(PaymentReceived);
    public const string HomeworkAssigned = nameof(HomeworkAssigned);
    public const string HomeworkStatusChanged = nameof(HomeworkStatusChanged);
    public const string ClassPublished = nameof(ClassPublished);
    public const string ClassThresholdAtRisk = nameof(ClassThresholdAtRisk);
    public const string RegisterOtpRequested = nameof(RegisterOtpRequested);
    public const string PasswordResetOtpRequested = nameof(PasswordResetOtpRequested);
    public const string ExternalCoachOtpRequested = nameof(ExternalCoachOtpRequested);
    public const string ExternalCoachReviewed = nameof(ExternalCoachReviewed);
    public const string ManualNotice = nameof(ManualNotice);
    public const string IncidentResolution = nameof(IncidentResolution);
    public const string PointConfirmationOtpRequested = nameof(PointConfirmationOtpRequested);
    public const string InvoiceCreated = nameof(InvoiceCreated);
    public const string RefundCompleted = nameof(RefundCompleted);
}
