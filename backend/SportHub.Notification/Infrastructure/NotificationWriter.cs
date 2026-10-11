using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Notification.Infrastructure;

/// <summary>
/// Bản cài đặt <see cref="INotificationWriter"/> (BR-33, BR-34).
///
/// Chỉ Add với Status = Pending trong change tracker của caller: đúng mô hình outbox mà
/// BR-34 mô tả cho quy mô MVP. Việc "gửi" là của NotificationDispatchJob, nên không có
/// đường nào để lỗi gửi làm hỏng hành động gốc.
/// </summary>
public sealed class NotificationWriter(ISportHubDbContext db, IDataProtectionProvider protection) : INotificationWriter
{
    private readonly IDataProtector _protector = protection.CreateProtector("SportHub.Notification.EmailPayload.v1");

    public void Queue(NotificationRequest request)
    {
        db.Set<Domain.Entities.Notification>().Add(new Domain.Entities.Notification
        {
            NotificationId = Guid.NewGuid(),
            UserId = request.UserId,

            // MVP chỉ InApp hoạt động thật (SSOT §1.3/§3).
            Channel = NotificationChannel.InApp,
            SourceEventType = MapEventType(request.SourceEventType),
            SourceEntityId = request.SourceEntityId,
            Message = request.Message,
            Status = NotificationStatus.Pending,
            RetryCount = 0
        });
    }

    public void QueueEmail(EmailNotificationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RecipientAddress) || request.RecipientAddress.Length > 320
            || string.IsNullOrWhiteSpace(request.Subject) || request.Subject.Length > 300
            || string.IsNullOrWhiteSpace(request.HtmlBody) || request.HtmlBody.Length > 24_000
            || request.SourceEntityId == Guid.Empty)
            throw new ArgumentException("Email outbox message has invalid address, subject, body, or event id.", nameof(request));
        var eventType = MapEventType(request.SourceEventType);
        var payload = JsonSerializer.Serialize(new EmailPayload(request.Subject, request.HtmlBody));
        db.Set<Domain.Entities.Notification>().Add(new Domain.Entities.Notification
        {
            NotificationId = Guid.NewGuid(), UserId = request.UserId,
            Channel = NotificationChannel.Email, SourceEventType = eventType,
            SourceEntityId = request.SourceEntityId, RecipientAddress = request.RecipientAddress.Trim(),
            ProtectedEmailPayload = _protector.Protect(payload), Message = string.Empty,
            Status = NotificationStatus.Pending, RetryCount = 0
        });
    }

    // Ném thay vì fallback im lặng: hằng chuỗi ở BuildingBlocks là bản mirror của enum này,
    // lệch nhau thì phải vỡ ngay ở test chứ không ghi nhầm loại sự kiện vào DB.
    private static NotificationSourceEventType MapEventType(string sourceEventType)
        => Enum.TryParse<NotificationSourceEventType>(sourceEventType, ignoreCase: false, out var parsed)
            ? parsed
            : throw new ArgumentOutOfRangeException(
                nameof(sourceEventType),
                sourceEventType,
                "Không khớp NotificationSourceEventType nào — xem NotificationEvents ở BuildingBlocks.");
}

public sealed record EmailPayload(string Subject, string HtmlBody);
