using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Notification.Application;

public sealed record NotificationDto(
    Guid NotificationId,
    string SourceEventType,
    Guid? SourceEntityId,
    string Message,
    string Status,
    DateTime? SentAt);

public interface INotificationService
{
    Task<IReadOnlyList<NotificationDto>> GetMineAsync(Guid userId, bool unreadOnly, CancellationToken ct = default);

    Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default);

    Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default);

    Task MarkAllReadAsync(Guid userId, CancellationToken ct = default);
}

public sealed class NotificationService(ISportHubDbContext db, IClock clock) : INotificationService
{
    public async Task<IReadOnlyList<NotificationDto>> GetMineAsync(
        Guid userId,
        bool unreadOnly,
        CancellationToken ct = default)
    {
        var query = db.Set<Domain.Entities.Notification>()
            .AsNoTracking()
            .Where(n => n.UserId == userId);

        if (unreadOnly)
        {
            query = query.Where(n => n.Status != NotificationStatus.Read);
        }

        return await query
            .OrderByDescending(n => n.SentAt ?? DateTime.MinValue)
            .ThenByDescending(n => n.NotificationId)
            .Take(100)
            .Select(n => new NotificationDto(
                n.NotificationId,
                n.SourceEventType.ToString(),
                n.SourceEntityId,
                n.Message,
                n.Status.ToString(),
                n.SentAt))
            .ToListAsync(ct);
    }

    // Pending cũng tính là chưa đọc: ở MVP thông báo InApp hiển thị ngay khi có trong DB,
    // job dispatch chỉ đổi nhãn trạng thái (BR-34) chứ không phải điều kiện để hiển thị.
    public Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default)
        => db.Set<Domain.Entities.Notification>()
            .CountAsync(n => n.UserId == userId && n.Status != NotificationStatus.Read, ct);

    public async Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default)
    {
        var notification = await db.Set<Domain.Entities.Notification>()
            .SingleOrDefaultAsync(n => n.NotificationId == notificationId, ct)
            ?? throw new NotFoundException("notification_not_found", "Không tìm thấy thông báo.");

        // Ownership kiểm ở đây, không chỉ ở UI: id là Guid đoán được nếu lộ ra chỗ khác.
        if (notification.UserId != userId)
        {
            throw new ForbiddenException("notification_not_owned", "Thông báo này không thuộc về bạn.");
        }

        if (notification.Status == NotificationStatus.Read)
        {
            return;
        }

        notification.Status = NotificationStatus.Read;
        notification.SentAt ??= clock.UtcNow;

        await db.SaveChangesAsync(ct);
    }

    public async Task MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        await db.Set<Domain.Entities.Notification>()
            .Where(n => n.UserId == userId && n.Status != NotificationStatus.Read)
            .ExecuteUpdateAsync(
                s => s.SetProperty(n => n.Status, NotificationStatus.Read)
                      .SetProperty(n => n.SentAt, n => n.SentAt ?? now),
                ct);
    }
}
