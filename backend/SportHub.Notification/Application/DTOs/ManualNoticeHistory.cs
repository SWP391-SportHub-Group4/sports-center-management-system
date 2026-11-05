using SportHub.Notification.Domain.Enums;

namespace SportHub.Notification.Application.DTOs;

public sealed record NoticeRecipientSnapshot(Guid UserId, string Name, string Email, string? Role = null);
public sealed record ManualNoticeSummary(Guid NoticeId, string Subject, DateTime CreatedAtUtc,
    string SenderName, int RecipientCount, bool SendInApp, bool SendEmail, bool IsLegacy);
public sealed record ManualNoticeRecipient(Guid UserId, string Name, string Email,
    NoticeChannelStatus? InApp, NoticeChannelStatus? EmailDelivery, string? Role = null);
public sealed record NoticeChannelStatus(NotificationStatus Status, int RetryCount, DateTime? SentAt,
    DateTime? LastAttemptAt);
