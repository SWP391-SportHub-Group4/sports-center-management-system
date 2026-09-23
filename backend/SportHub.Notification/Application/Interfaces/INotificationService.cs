using SportHub.Notification.Application.Services;

namespace SportHub.Notification.Application.Interfaces;

public interface INotificationService
{
    Task<IReadOnlyList<NotificationResponse>> GetMineAsync(Guid userId, bool unreadOnly, CancellationToken ct = default);

    Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default);

    Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default);

    Task MarkAllReadAsync(Guid userId, CancellationToken ct = default);
}
