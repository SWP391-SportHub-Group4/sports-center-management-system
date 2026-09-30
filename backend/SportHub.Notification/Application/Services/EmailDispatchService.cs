using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;
using SportHub.Notification.Infrastructure;

namespace SportHub.Notification.Application.Services;

/// <summary>Claims encrypted email outbox rows in a short transaction, sends outside locks, then records delivery.</summary>
public sealed class EmailDispatchService(ISportHubDbContext db, IEmailSender sender,
    IDataProtectionProvider protection, IClock clock, ILogger<EmailDispatchService> logger)
{
    private const int MaxAttempts = 8;
    private const int BatchSize = 25;
    private readonly IDataProtector _protector = protection.CreateProtector("SportHub.Notification.EmailPayload.v1");

    public async Task<int> DispatchBatchAsync(CancellationToken ct = default)
    {
        List<Domain.Entities.Notification> claimed;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var candidates = await db.Set<Domain.Entities.Notification>().FromSqlInterpolated($"""
                SELECT * FROM notifications
                WHERE channel = {(int)NotificationChannel.Email}
                  AND status IN ({(int)NotificationStatus.Pending}, {(int)NotificationStatus.Failed}, {(int)NotificationStatus.Sending})
                  AND retry_count < {MaxAttempts}
                ORDER BY last_attempt_at NULLS FIRST, notification_id
                FOR UPDATE SKIP LOCKED
                LIMIT {BatchSize * 4}
                """).ToListAsync(ct);
            var now = clock.UtcNow;
            claimed = candidates.Where(x =>
                    (x.Status is NotificationStatus.Pending)
                    || (x.Status == NotificationStatus.Failed && IsRetryDue(x, now))
                    || (x.Status == NotificationStatus.Sending && x.DispatchLeaseUntilUtc <= now))
                .Take(BatchSize).ToList();
            foreach (var row in claimed)
            {
                row.Status = NotificationStatus.Sending;
                row.RetryCount++;
                row.LastAttemptAt = now;
                row.DispatchLeaseUntilUtc = now.AddMinutes(5);
                row.LastError = null;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        foreach (var row in claimed)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(row.RecipientAddress) || string.IsNullOrWhiteSpace(row.ProtectedEmailPayload))
                    throw new InvalidOperationException("Email outbox payload is incomplete.");
                var json = _protector.Unprotect(row.ProtectedEmailPayload);
                var payload = JsonSerializer.Deserialize<EmailPayload>(json)
                    ?? throw new InvalidOperationException("Email outbox payload cannot be read.");
                await sender.SendAsync(row.RecipientAddress, payload.Subject, EmailTemplateRenderer.Render(payload), ct);
                await db.Set<Domain.Entities.Notification>().Where(x => x.NotificationId == row.NotificationId
                        && x.Channel == NotificationChannel.Email && x.Status == NotificationStatus.Sending
                        && x.RetryCount == row.RetryCount && x.LastAttemptAt == row.LastAttemptAt)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, NotificationStatus.Sent)
                        .SetProperty(x => x.SentAt, clock.UtcNow)
                        .SetProperty(x => x.DispatchLeaseUntilUtc, (DateTime?)null)
                        .SetProperty(x => x.ProtectedEmailPayload, (string?)null)
                        .SetProperty(x => x.LastError, (string?)null), ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                var error = ex.GetType().Name;
                await db.Set<Domain.Entities.Notification>().Where(x => x.NotificationId == row.NotificationId
                        && x.Channel == NotificationChannel.Email && x.Status == NotificationStatus.Sending
                        && x.RetryCount == row.RetryCount && x.LastAttemptAt == row.LastAttemptAt)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, NotificationStatus.Failed)
                        .SetProperty(x => x.DispatchLeaseUntilUtc, (DateTime?)null)
                        .SetProperty(x => x.LastError, error), CancellationToken.None);
                logger.LogWarning("Email outbox dispatch failed for notification {NotificationId}; attempt {Attempt}.",
                    row.NotificationId, row.RetryCount);
            }
        }
        return claimed.Count;
    }

    private static bool IsRetryDue(Domain.Entities.Notification row, DateTime now)
    {
        if (row.LastAttemptAt is null) return true;
        var seconds = Math.Min(3600, 15 * Math.Pow(2, Math.Clamp(row.RetryCount - 1, 0, 8)));
        return row.LastAttemptAt.Value.AddSeconds(seconds) <= now;
    }
}
