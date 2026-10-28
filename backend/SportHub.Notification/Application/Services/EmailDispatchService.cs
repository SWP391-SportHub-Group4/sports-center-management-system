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

public sealed class EmailDispatchService(
    ISportHubDbContext db,
    IEmailSender sender,
    IDataProtectionProvider protection,
    IClock clock,
    ILogger<EmailDispatchService> logger)
{
    private const int MaxAttempts = 8;
    private const int BatchSize = 25;

    private readonly IDataProtector _protector =
        protection.CreateProtector(
            "SportHub.Notification.EmailPayload.v1");

    public async Task<int> DispatchBatchAsync(
        CancellationToken ct = default)
    {
        List<Domain.Entities.Notification> claimed;

        await using (
            var tx =
                await db.Database
                    .BeginTransactionAsync(ct))
        {
            var candidates =
                await db
                    .Set<Domain.Entities.Notification>()
                    .FromSqlInterpolated($"""
                        SELECT * FROM notifications
                        WHERE channel = {(int)NotificationChannel.Email}
                          AND status IN (
                              {(int)NotificationStatus.Pending},
                              {(int)NotificationStatus.Failed},
                              {(int)NotificationStatus.Sending}
                          )
                          AND retry_count < {MaxAttempts}
                        ORDER BY last_attempt_at NULLS FIRST, notification_id
                        FOR UPDATE SKIP LOCKED
                        LIMIT {BatchSize * 4}
                        """)
                    .ToListAsync(ct);

            var now =
                clock.UtcNow;

            claimed =
                candidates
                    .Where(
                        x =>
                            x.Status ==
                                NotificationStatus.Pending ||
                            (
                                x.Status ==
                                    NotificationStatus.Failed &&
                                IsRetryDue(x, now)
                            ) ||
                            (
                                x.Status ==
                                    NotificationStatus.Sending &&
                                x.DispatchLeaseUntilUtc <= now
                            ))
                    .Take(BatchSize)
                    .ToList();

            foreach (var row in claimed)
            {
                row.Status =
                    NotificationStatus.Sending;

                row.RetryCount++;

                row.LastAttemptAt =
                    now;

                row.DispatchLeaseUntilUtc =
                    now.AddMinutes(5);

                row.LastError =
                    null;
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        foreach (var row in claimed)
        {
            var stage = "validate";
            try
            {
                if (
                    string.IsNullOrWhiteSpace(
                        row.RecipientAddress) ||
                    string.IsNullOrWhiteSpace(
                        row.ProtectedEmailPayload))
                {
                    throw new
                        InvalidOperationException(
                            "Email outbox payload is incomplete.");
                }

                stage = "decrypt";
                var json =
                    _protector.Unprotect(
                        row.ProtectedEmailPayload);

                stage = "deserialize";
                var payload =
                    JsonSerializer
                        .Deserialize<EmailPayload>(json)
                    ?? throw new
                        InvalidOperationException(
                            "Email outbox payload cannot be read.");

                stage = "attachments";
                var attachments =
                    (payload.Attachments ??
                     Array.Empty<EmailAttachmentPayload>())
                    .Select(
                        x =>
                            new EmailAttachment(
                                x.FileName,
                                x.ContentType,
                                Convert.FromBase64String(
                                    x.Base64Content)))
                    .ToArray();

                stage = "render";
                var body =
                    EmailTemplateRenderer.Render(
                        payload);

                stage = "send";
                if (attachments.Length > 0)
                {
                    await sender.SendAsync(
                        row.RecipientAddress,
                        payload.Subject,
                        body,
                        attachments,
                        ct);
                }
                else
                {
                    await sender.SendAsync(
                        row.RecipientAddress,
                        payload.Subject,
                        body,
                        ct);
                }

                stage = "record-delivery";
                await db
                    .Set<Domain.Entities.Notification>()
                    .Where(
                        x =>
                            x.NotificationId ==
                                row.NotificationId &&
                            x.Channel ==
                                NotificationChannel.Email &&
                            x.Status ==
                                NotificationStatus.Sending &&
                            x.RetryCount ==
                                row.RetryCount &&
                            x.LastAttemptAt ==
                                row.LastAttemptAt)
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                    x => x.Status,
                                    NotificationStatus.Sent)
                                .SetProperty(
                                    x => x.SentAt,
                                    clock.UtcNow)
                                .SetProperty(
                                    x =>
                                        x.DispatchLeaseUntilUtc,
                                    (DateTime?)null)
                                .SetProperty(
                                    x =>
                                        x.ProtectedEmailPayload,
                                    (string?)null)
                                .SetProperty(
                                    x => x.LastError,
                                    (string?)null),
                        ct);
            }
            catch (Exception ex)
                when (
                    ex is not
                        OperationCanceledException)
            {
                var error =
                    ex.GetType().Name;

                await db
                    .Set<Domain.Entities.Notification>()
                    .Where(
                        x =>
                            x.NotificationId ==
                                row.NotificationId &&
                            x.Channel ==
                                NotificationChannel.Email &&
                            x.Status ==
                                NotificationStatus.Sending &&
                            x.RetryCount ==
                                row.RetryCount &&
                            x.LastAttemptAt ==
                                row.LastAttemptAt)
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                    x => x.Status,
                                    NotificationStatus.Failed)
                                .SetProperty(
                                    x =>
                                        x.DispatchLeaseUntilUtc,
                                    (DateTime?)null)
                                .SetProperty(
                                    x => x.LastError,
                                    error),
                        CancellationToken.None);

                logger.LogWarning(
                    "Email outbox dispatch failed for notification {NotificationId}; attempt {Attempt}; stage {Stage}; error {ErrorType}; reason {Reason}; sender {Sender}; instance {Instance}.",
                    row.NotificationId,
                    row.RetryCount,
                    stage,
                    error,
                    FailureReason(stage, ex),
                    sender.GetType().Name,
                    Environment.MachineName);
            }
        }

        return claimed.Count;
    }

    // Only fixed diagnostic codes are logged; provider messages can contain secrets or email content.
    private static string FailureReason(string stage, Exception error)
    {
        if (stage == "decrypt")
        {
            if (error.Message.Contains("key ring", StringComparison.OrdinalIgnoreCase) &&
                error.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
                return "key_not_found";
            return "payload_unprotect_failed";
        }
        if (stage == "send" && error is HttpRequestException { StatusCode: { } status })
            return $"http_{(int)status}";
        return "operation_failed";
    }

    private static bool IsRetryDue(
        Domain.Entities.Notification row,
        DateTime now)
    {
        if (row.LastAttemptAt is null)
            return true;

        var seconds =
            Math.Min(
                3600,
                15 *
                Math.Pow(
                    2,
                    Math.Clamp(
                        row.RetryCount - 1,
                        0,
                        8)));

        return row.LastAttemptAt.Value
            .AddSeconds(seconds) <= now;
    }
}
