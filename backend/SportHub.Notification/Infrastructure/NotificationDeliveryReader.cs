using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Notification.Infrastructure;

public sealed class NotificationDeliveryReader(ISportHubDbContext db) : INotificationDeliveryReader
{
    public Task<NotificationDelivery> GetAsync(string eventType, Guid sourceId, CancellationToken cancellationToken = default)
        => GetManyAsync(eventType, [sourceId], cancellationToken);

    public async Task<NotificationDelivery> GetManyAsync(string eventType, IReadOnlyList<Guid> sourceIds, CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<NotificationSourceEventType>(eventType, out var source))
            throw new ArgumentException("Unknown notification event.", nameof(eventType));
        var rows = await db.Set<Domain.Entities.Notification>().AsNoTracking()
            .Where(x => x.SourceEntityId != null && sourceIds.Contains(x.SourceEntityId.Value) && x.SourceEventType == source)
            .GroupBy(x => x.Status).Select(x => new { Status = x.Key, Count = x.Count() }).ToListAsync(cancellationToken);
        int Count(NotificationStatus status) => rows.Where(x => x.Status == status).Sum(x => x.Count);
        return new(rows.Sum(x => x.Count), Count(NotificationStatus.Pending), Count(NotificationStatus.Sending),
            Count(NotificationStatus.Sent), Count(NotificationStatus.Failed), Count(NotificationStatus.Read));
    }
}
