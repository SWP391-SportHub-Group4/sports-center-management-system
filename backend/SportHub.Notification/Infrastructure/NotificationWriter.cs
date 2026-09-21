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
public sealed class NotificationWriter(ISportHubDbContext db) : INotificationWriter
{
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
