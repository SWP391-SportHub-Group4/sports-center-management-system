namespace SportHub.BuildingBlocks.Abstractions.Notifications;

public interface INotificationWriter
{
    void Queue(NotificationRequest request);

    void QueueEmail(EmailNotificationRequest request);

    Task ReviseInvoiceCreatedAsync(Guid memberId, Guid invoiceId, string message, CancellationToken ct);
}

public sealed record NotificationRequest(
    Guid UserId,
    string SourceEventType,
    string Message,
    Guid? SourceEntityId = null);

public sealed record EmailAttachmentRequest(
    string FileName,
    string ContentType,
    byte[] Content);

public sealed record EmailNotificationRequest(
    Guid? UserId,
    string RecipientAddress,
    string SourceEventType,
    Guid SourceEntityId,
    string Subject,
    string HtmlBody,
    IReadOnlyList<EmailAttachmentRequest>? Attachments = null);

public static class NotificationEvents
{
    public const string PaymentUnactivated = nameof(PaymentUnactivated);
    public const string PaymentConvertedToPoints = nameof(PaymentConvertedToPoints);
    public const string SupportRequestAssigned = nameof(SupportRequestAssigned);
    public const string SupportRequestReceived = nameof(SupportRequestReceived);
    public const string SupportRequestReminded = nameof(SupportRequestReminded);
    public const string SupportSlaReminder = nameof(SupportSlaReminder);
    public const string SupportPayoutRecorded = nameof(SupportPayoutRecorded);
    public const string SupportPayoutNotReceived = nameof(SupportPayoutNotReceived);
    public const string CoachAttendanceReminder = nameof(CoachAttendanceReminder);
    public const string AvatarReported = nameof(AvatarReported);
    public const string ClassSessionReminder = nameof(ClassSessionReminder);
    public const string ClassSessionChangeRequested =
        nameof(ClassSessionChangeRequested);

    public const string ClassSessionChangeReviewed =
        nameof(ClassSessionChangeReviewed);

    public const string ClassCancelled =
        nameof(ClassCancelled);

    public const string ScheduleChanged =
        nameof(ScheduleChanged);

    public const string PackageExpiring =
        nameof(PackageExpiring);

    public const string PaymentReceived =
        nameof(PaymentReceived);

    public const string ClassPublished =
        nameof(ClassPublished);

    public const string ClassThresholdAtRisk =
        nameof(ClassThresholdAtRisk);

    public const string RegisterOtpRequested =
        nameof(RegisterOtpRequested);

    public const string PasswordResetOtpRequested =
        nameof(PasswordResetOtpRequested);

    public const string ManualNotice =
        nameof(ManualNotice);

    public const string IncidentResolution =
        nameof(IncidentResolution);

    public const string PointConfirmationOtpRequested =
        nameof(PointConfirmationOtpRequested);

    public const string InvoiceCreated =
        nameof(InvoiceCreated);

    public const string RefundCompleted =
        nameof(RefundCompleted);

    public const string ClassTeachingUpdated =
        nameof(ClassTeachingUpdated);

    public const string PasswordChanged =
        nameof(PasswordChanged);

    public const string ClassEnrollmentClosed =
        nameof(ClassEnrollmentClosed);

    public const string ClassEnrollmentReopened =
        nameof(ClassEnrollmentReopened);

    public const string ClassThresholdConfirmed =
        nameof(ClassThresholdConfirmed);

    public const string CoachCoverageRequired =
        nameof(CoachCoverageRequired);
}
