using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Application.DTOs;
using SportHub.Notification.Domain.Enums;
using SportHub.Notification.Domain.Entities;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Pagination;

namespace SportHub.Notification.Application.Services;

public sealed class ManualNoticeService(ISportHubDbContext db, INotificationWriter notifications, IAuditWriter audit,
    IAuditReader receipts, INotificationDeliveryReader delivery, IClock clock)
{
    public async Task<Guid> SendAsync(ManualNoticeRequest request, Guid managerId, CancellationToken ct = default,
        string? idempotencyKey = null)
    {
        var noticeId = idempotencyKey is null ? Guid.NewGuid() : IdForKey(managerId, idempotencyKey);
        var recipients = request.RecipientUserIds.Distinct().Order().ToList();
        var roleNames = request.SendToRoles.Select(r => (r ?? "").Trim().ToUpperInvariant()).Distinct().Order().ToArray();
        var selectedRoles = roleNames.Select(role => role switch {
            "SYSTEM_ADMINISTRATOR" => UserRole.SystemAdministrator,
            "CENTER_MANAGER" => UserRole.CenterManager,
            "RECEPTIONIST" => UserRole.Receptionist,
            "COACH" => UserRole.Coach,
            "MEMBER" => UserRole.Member,
            _ => throw new BadRequestException("notice_recipient_role_invalid", "Choose a valid recipient role.")
        }).ToArray();
        var safeSubject = request.Subject.Trim();
        var safeMessage = request.Message.Trim();
        if ((request.SendToAll ? recipients.Count != 0 || selectedRoles.Length != 0
                : recipients.Count > 200 || (recipients.Count == 0 && selectedRoles.Length == 0))
            || (!request.SendInApp && !request.SendEmail))
            throw new BadRequestException("invalid_manual_notice", "Invalid manual notice.");
        if (safeSubject.Length is < 3 or > 150 || safeMessage.Length is < 3 or > 3000)
            throw new BadRequestException("invalid_manual_notice", "Invalid manual notice.");
        // Broadcast fingerprints describe the requested scope, not the changing account directory.
        // Replays return the original receipt and never add accounts activated after the first send.
        var fingerprintPayload = request.SendToAll
            ? JsonSerializer.Serialize(new { recipients, safeSubject, safeMessage, request.SendInApp, request.SendEmail, sendToAll = true })
            : selectedRoles.Length > 0
            ? JsonSerializer.Serialize(new { recipients, safeSubject, safeMessage, request.SendInApp, request.SendEmail, sendToRoles = roleNames })
            : JsonSerializer.Serialize(new { recipients, safeSubject, safeMessage, request.SendInApp, request.SendEmail });
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fingerprintPayload)));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"manual-notice:{noticeId}"}, 0))", ct);
        var previous = await receipts.FindNewValueAsync(managerId, "SEND_MANUAL_NOTICE", "Notification", noticeId.ToString(), ct);
        if (previous is not null)
        {
            using var receipt = JsonDocument.Parse(previous);
            if (!receipt.RootElement.TryGetProperty("requestFingerprint", out var saved) || saved.GetString() != fingerprint)
                throw new ConflictException("notice_idempotency_conflict", "Notice idempotency conflict.");
            await tx.CommitAsync(ct);
            return noticeId;
        }
        var usersQuery = db.Set<UserAccount>().AsNoTracking().Where(x => x.Status == UserStatus.Active);
        if (!request.SendToAll) usersQuery = usersQuery.Where(x => recipients.Contains(x.UserId)
            || selectedRoles.Contains(x.Role!.RoleName));
        var users = await usersQuery
            .Select(x => new NoticeRecipientSnapshot(x.UserId,
                x.Profile != null && x.Profile.FullName != "" ? x.Profile.FullName : x.Email, x.Email)).ToListAsync(ct);
        var foundIds = users.Select(u => u.UserId).ToHashSet();
        if (users.Count == 0 || recipients.Any(id => !foundIds.Contains(id)))
            throw new BadRequestException("manual_notice_recipient_invalid", "Manual notice recipient invalid.");

        var senderName = await db.Set<UserAccount>().Where(x => x.UserId == managerId)
            .Select(x => x.Profile != null && x.Profile.FullName != "" ? x.Profile.FullName : x.Email).SingleAsync(ct);
        db.Set<ManualNoticeRecord>().Add(new ManualNoticeRecord
        {
            NoticeId = noticeId, ManagerId = managerId, SenderName = senderName, CreatedAtUtc = clock.UtcNow,
            Subject = safeSubject, Message = safeMessage, SendInApp = request.SendInApp, SendEmail = request.SendEmail,
            RecipientCount = users.Count, RecipientsJson = JsonSerializer.Serialize(users.OrderBy(x => x.Name).ThenBy(x => x.UserId))
        });

        var body = SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(safeMessage);
        foreach (var user in users)
        {
            if (request.SendInApp)
                notifications.Queue(new NotificationRequest(user.UserId, NotificationEvents.ManualNotice,
                    safeMessage, noticeId));
            if (request.SendEmail)
                notifications.QueueEmail(new EmailNotificationRequest(user.UserId, user.Email,
                    NotificationEvents.ManualNotice, noticeId, safeSubject, body));
        }
        audit.Write(new AuditEntry(managerId, "SEND_MANUAL_NOTICE", "Notification", noticeId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                recipientCount = users.Count, request.SendToAll, sendToRoles = roleNames, request.SendInApp, request.SendEmail, subject = safeSubject, requestFingerprint = fingerprint
            })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return noticeId;
    }

    public async Task<ManualNoticeReceipt> GetAsync(Guid noticeId, Guid managerId, CancellationToken ct = default)
    {
        var row = await RequireOwnedAsync(noticeId, managerId, ct);
        return new(noticeId, await delivery.GetAsync(NotificationEvents.ManualNotice, noticeId, ct),
            row.Subject, row.Message, row.CreatedAtUtc, row.SenderName, row.RecipientCount,
            row.SendInApp, row.SendEmail, row.IsLegacy);
    }

    public async Task<PagedResult<ManualNoticeSummary>> ListAsync(Guid managerId, string? search,
        DateOnly? fromDate, DateOnly? toDate, int page, int pageSize, CancellationToken ct)
    {
        if (fromDate > toDate || fromDate == DateOnly.MinValue || toDate == DateOnly.MaxValue)
            throw new BadRequestException("notice_date_range_invalid", "Choose a valid date range.");
        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query = db.Set<ManualNoticeRecord>().AsNoTracking().Where(x => x.ManagerId == managerId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            if (term.Length > 150) throw new BadRequestException("notice_search_invalid", "Search is limited to 150 characters.");
            query = query.Where(x => x.Subject.ToLower().Contains(term));
        }
        if (fromDate is { } from)
        {
            var start = VietnamTime.StartOfDayUtc(from);
            query = query.Where(x => x.CreatedAtUtc >= start);
        }
        if (toDate is { } to)
        {
            var end = VietnamTime.StartOfDayUtc(to.AddDays(1));
            query = query.Where(x => x.CreatedAtUtc < end);
        }
        return new PagedResult<ManualNoticeSummary>
        {
            Page = page, PageSize = pageSize, TotalCount = await query.CountAsync(ct),
            Items = await query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.NoticeId)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new ManualNoticeSummary(x.NoticeId, x.Subject, x.CreatedAtUtc, x.SenderName,
                    x.RecipientCount, x.SendInApp, x.SendEmail, x.IsLegacy)).ToListAsync(ct)
        };
    }

    public async Task<PagedResult<ManualNoticeRecipient>> RecipientsAsync(Guid noticeId, Guid managerId,
        int page, int pageSize, CancellationToken ct)
    {
        var row = await RequireOwnedAsync(noticeId, managerId, ct);
        var snapshots = JsonSerializer.Deserialize<List<NoticeRecipientSnapshot>>(row.RecipientsJson) ?? [];
        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var selected = snapshots.OrderBy(x => x.Name).ThenBy(x => x.UserId).Skip((page - 1) * pageSize).Take(pageSize).ToList();
        var ids = selected.Select(x => x.UserId).ToArray();
        var rows = await db.Set<Domain.Entities.Notification>().AsNoTracking()
            .Where(x => x.SourceEventType == NotificationSourceEventType.ManualNotice && x.SourceEntityId == noticeId
                && x.UserId != null && ids.Contains(x.UserId.Value))
            .Select(x => new { x.UserId, x.Channel, x.Status, x.RetryCount, x.SentAt, x.LastAttemptAt }).ToListAsync(ct);
        NoticeChannelStatus? Status(Guid userId, NotificationChannel channel)
        {
            var item = rows.FirstOrDefault(x => x.UserId == userId && x.Channel == channel);
            return item is null ? null : new(item.Status, item.RetryCount, item.SentAt, item.LastAttemptAt);
        }
        return new PagedResult<ManualNoticeRecipient>
        {
            Page = page, PageSize = pageSize, TotalCount = snapshots.Count,
            Items = selected.Select(x => new ManualNoticeRecipient(x.UserId, x.Name, x.Email,
                Status(x.UserId, NotificationChannel.InApp), Status(x.UserId, NotificationChannel.Email))).ToList()
        };
    }

    private async Task<ManualNoticeRecord> RequireOwnedAsync(Guid noticeId, Guid managerId, CancellationToken ct)
        => await db.Set<ManualNoticeRecord>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.NoticeId == noticeId && x.ManagerId == managerId, ct)
            ?? throw new NotFoundException("notice_not_found", "Notice not found.");

    public async Task<ManualNoticeReceipt> GetByKeyAsync(string key, Guid managerId, CancellationToken ct = default)
    {
        var id = IdForKey(managerId, key);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"manual-notice:{id}"}, 0))", ct);
        var receipt = await GetAsync(id, managerId, ct);
        await tx.CommitAsync(ct);
        return receipt;
    }

    private static Guid IdForKey(Guid managerId, string key)
    {
        if (!Guid.TryParse(key, out var parsed) || parsed == Guid.Empty)
            throw new BadRequestException("invalid_idempotency_key", "Invalid idempotency key.");
        return new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"manual-notice:{managerId:D}:{parsed:D}")).AsSpan(0, 16));
    }
}
public sealed record ManualNoticeReceipt(Guid NoticeId, NotificationDelivery Delivery, string Subject,
    string? Message, DateTime CreatedAtUtc, string SenderName, int RecipientCount, bool SendInApp, bool SendEmail, bool IsLegacy);
