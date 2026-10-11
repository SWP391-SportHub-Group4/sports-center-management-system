namespace SportHub.Notification.Application.Interfaces;

public interface INotificationActionReader
{
    Task<IReadOnlyDictionary<Guid, string>> GetMemberActionsAsync(
        Guid userId, IReadOnlyList<Services.NotificationResponse> notifications, CancellationToken ct);
}
