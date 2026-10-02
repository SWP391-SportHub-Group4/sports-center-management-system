namespace SportHub.BuildingBlocks.Abstractions.Notifications;

public interface INotificationDeliveryReader
{
    Task<NotificationDelivery> GetAsync(string eventType, Guid sourceId, CancellationToken cancellationToken = default);
    Task<NotificationDelivery> GetManyAsync(string eventType, IReadOnlyList<Guid> sourceIds, CancellationToken cancellationToken = default);
}
public sealed record NotificationDelivery(int Total, int Pending, int Sending, int Sent, int Failed, int Read);
