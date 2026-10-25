using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Application.Interfaces;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Notification.Application.Services;

public sealed record NotificationResponse(
    Guid NotificationId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceEventType,
    Guid? SourceEntityId,
    string Message,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime? SentAt,
    string? ActionUrl = null,
    string? Title = null,
    string? SenderName = null);

public sealed record NotificationInboxPage(IReadOnlyList<NotificationResponse> Items,
    int TotalCount, int Page, int PageSize);

public sealed class NotificationService(ISportHubDbContext db, IClock clock, INotificationActionReader actions) : INotificationService
{
    public async Task<IReadOnlyList<NotificationResponse>> GetMineAsync(
        Guid userId,
        bool unreadOnly,
        CancellationToken ct = default)
    {
        var query = db.Set<Domain.Entities.Notification>()
            .AsNoTracking()
            .Where(n => n.UserId == userId && n.Channel == NotificationChannel.InApp);

        if (unreadOnly)
        {
            query = query.Where(n => n.Status != NotificationStatus.Read);
        }

        var rows = await query
            .OrderByDescending(n => n.SentAt ?? DateTime.MinValue)
            .ThenByDescending(n => n.NotificationId)
            .Take(100)
            .Select(n => new NotificationResponse(
                n.NotificationId,
                n.SourceEventType.ToString(),
                n.SourceEntityId,
                n.Message,
                n.Status.ToString(),
                n.SentAt, null, null, null))
            .ToListAsync(ct);
        return await WithDetailsAsync(userId, rows, ct);
    }

    public async Task<NotificationInboxPage> GetInboxAsync(Guid userId, bool unreadOnly,
        string? search, int page, int pageSize, CancellationToken ct = default)
    {
        if (page is < 1 or > 100_000 || pageSize is < 1 or > 50 || search?.Length > 150)
            throw new BadRequestException("notification_filter_invalid", "Choose a valid page and a search of up to 150 characters.");

        var query = db.Set<Domain.Entities.Notification>().AsNoTracking()
            .Where(n => n.UserId == userId && n.Channel == NotificationChannel.InApp);
        if (unreadOnly) query = query.Where(n => n.Status != NotificationStatus.Read);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(n => n.Message.ToLower().Contains(term)
                || n.SourceEventType == NotificationSourceEventType.ManualNotice
                    && db.Set<Domain.Entities.ManualNoticeRecord>().Any(m => m.NoticeId == n.SourceEntityId
                        && m.Subject.ToLower().Contains(term)));
        }
        var count = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(n => n.SentAt ?? DateTime.MinValue)
            .ThenByDescending(n => n.NotificationId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(n => new NotificationResponse(n.NotificationId, n.SourceEventType.ToString(),
                n.SourceEntityId, n.Message, n.Status.ToString(), n.SentAt, null, null, null))
            .ToListAsync(ct);
        return new(await WithDetailsAsync(userId, rows, ct), count, page, pageSize);
    }

    public async Task<NotificationResponse> GetAsync(Guid userId, Guid notificationId, CancellationToken ct = default)
    {
        var row = await db.Set<Domain.Entities.Notification>().AsNoTracking()
            .Where(n => n.UserId == userId && n.NotificationId == notificationId && n.Channel == NotificationChannel.InApp)
            .Select(n => new NotificationResponse(n.NotificationId, n.SourceEventType.ToString(),
                n.SourceEntityId, n.Message, n.Status.ToString(), n.SentAt, null, null, null))
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("notification_not_found", "Notification not found.");
        return (await WithDetailsAsync(userId, [row], ct))[0];
    }

    private async Task<IReadOnlyList<NotificationResponse>> WithDetailsAsync(Guid userId,
        IReadOnlyList<NotificationResponse> rows, CancellationToken ct)
    {
        var destinations = await actions.GetMemberActionsAsync(userId, rows, ct);
        var invoiceMessages = await actions.GetInvoiceNoticeMessagesAsync(userId, rows, ct);
        // Read only subjects/senders of manual notices referenced by this user's own in-app messages.
        var manualIds = rows.Where(n => n.SourceEventType == nameof(NotificationSourceEventType.ManualNotice)
            && n.SourceEntityId.HasValue).Select(n => n.SourceEntityId!.Value).Distinct().ToArray();
        var notices = await db.Set<Domain.Entities.ManualNoticeRecord>().AsNoTracking()
            .Where(m => manualIds.Contains(m.NoticeId))
            .Select(m => new { m.NoticeId, m.Subject, m.SenderName }).ToDictionaryAsync(m => m.NoticeId, ct);
        return rows.Select(n =>
        {
            var manual = n.SourceEventType == nameof(NotificationSourceEventType.ManualNotice)
                && n.SourceEntityId.HasValue ? notices.GetValueOrDefault(n.SourceEntityId.Value) : null;
            return n with { ActionUrl = destinations.GetValueOrDefault(n.NotificationId),
                Message = invoiceMessages.GetValueOrDefault(n.NotificationId) ?? n.Message,
                Title = manual?.Subject, SenderName = manual?.SenderName };
        }).ToList();
    }

    // Pending cũng tính là chưa đọc: ở MVP thông báo InApp hiển thị ngay khi có trong DB,
    // job dispatch chỉ đổi nhãn trạng thái (BR-34) chứ không phải điều kiện để hiển thị.
    public Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default)
        => db.Set<Domain.Entities.Notification>()
            .CountAsync(n => n.UserId == userId && n.Channel == NotificationChannel.InApp
                && n.Status != NotificationStatus.Read, ct);

    public async Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default)
    {
        var notification = await db.Set<Domain.Entities.Notification>()
            .SingleOrDefaultAsync(n => n.NotificationId == notificationId && n.Channel == NotificationChannel.InApp, ct)
            ?? throw new NotFoundException("notification_not_found", "Notification not found.");

        // Ownership kiểm ở đây, không chỉ ở UI: id là Guid đoán được nếu lộ ra chỗ khác.
        if (notification.UserId != userId)
        {
            throw new ForbiddenException("notification_not_owned", "Notification not owned.");
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
            .Where(n => n.UserId == userId && n.Channel == NotificationChannel.InApp
                && n.Status != NotificationStatus.Read)
            .ExecuteUpdateAsync(
                s => s.SetProperty(n => n.Status, NotificationStatus.Read)
                      .SetProperty(n => n.SentAt, n => n.SentAt ?? now),
                ct);
    }
}
