using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Notification.Infrastructure;

public sealed class NotificationWriter(
    ISportHubDbContext db,
    IDataProtectionProvider protection)
    : INotificationWriter
{
    private const int MaxAttachmentBytes =
        2 * 1024 * 1024;

    private readonly IDataProtector _protector =
        protection.CreateProtector(
            "SportHub.Notification.EmailPayload.v1");

    public void Queue(
        NotificationRequest request)
    {
        db.Set<Domain.Entities.Notification>()
            .Add(
                new Domain.Entities.Notification
                {
                    NotificationId = Guid.NewGuid(),
                    UserId = request.UserId,
                    Channel = NotificationChannel.InApp,
                    SourceEventType =
                        MapEventType(request.SourceEventType),
                    SourceEntityId =
                        request.SourceEntityId,
                    Message =
                        request.Message,
                    Status =
                        NotificationStatus.Pending,
                    RetryCount = 0
                });
    }

    public async Task ReviseInvoiceCreatedAsync(Guid memberId, Guid invoiceId, string message, CancellationToken ct)
    {
        await db.Set<Domain.Entities.Notification>()
            .Where(n => n.UserId == memberId && n.Channel == NotificationChannel.InApp
                && n.SourceEventType == NotificationSourceEventType.InvoiceCreated
                && n.SourceEntityId == invoiceId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(n => n.Message, message), ct);

        // The original invoice email may still be queued when checkout closes.
        // Replace its protected payload so a later dispatch cannot ask for payment.
        var emailPayload = _protector.Protect(JsonSerializer.Serialize(new EmailPayload(
            "SportHub - Invoice update",
            SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(message))));
        await db.Set<Domain.Entities.Notification>()
            .Where(n => n.UserId == memberId && n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.InvoiceCreated
                && n.SourceEntityId == invoiceId
                && (n.Status == NotificationStatus.Pending || n.Status == NotificationStatus.Failed))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(n => n.ProtectedEmailPayload, emailPayload)
                .SetProperty(n => n.Status, NotificationStatus.Pending)
                .SetProperty(n => n.RetryCount, 0), ct);
    }

    public void QueueEmail(
        EmailNotificationRequest request)
    {
        if (
            string.IsNullOrWhiteSpace(
                request.RecipientAddress) ||
            request.RecipientAddress.Length > 320 ||
            string.IsNullOrWhiteSpace(
                request.Subject) ||
            request.Subject.Length > 300 ||
            string.IsNullOrWhiteSpace(
                request.HtmlBody) ||
            request.HtmlBody.Length > 50_000 ||
            request.SourceEntityId == Guid.Empty)
        {
            throw new ArgumentException(
                "Email outbox message has invalid address, subject, body, or event id.",
                nameof(request));
        }

        var attachments =
            request.Attachments ??
            Array.Empty<EmailAttachmentRequest>();

        var totalAttachmentBytes =
            attachments.Sum(
                x => x.Content.Length);

        if (totalAttachmentBytes >
            MaxAttachmentBytes)
        {
            throw new ArgumentException(
                "Email attachments exceed the 2 MB outbox limit.",
                nameof(request));
        }

        foreach (var attachment in attachments)
        {
            if (
                string.IsNullOrWhiteSpace(
                    attachment.FileName) ||
                string.IsNullOrWhiteSpace(
                    attachment.ContentType) ||
                attachment.Content.Length == 0)
            {
                throw new ArgumentException(
                    "Email attachment is invalid.",
                    nameof(request));
            }
        }

        var payload =
            JsonSerializer.Serialize(
                new EmailPayload(
                    request.Subject,
                    request.HtmlBody,
                    attachments
                        .Select(
                            x =>
                                new EmailAttachmentPayload(
                                    x.FileName,
                                    x.ContentType,
                                    Convert.ToBase64String(
                                        x.Content)))
                        .ToArray()));

        db.Set<Domain.Entities.Notification>()
            .Add(
                new Domain.Entities.Notification
                {
                    NotificationId = Guid.NewGuid(),
                    UserId = request.UserId,
                    Channel = NotificationChannel.Email,
                    SourceEventType =
                        MapEventType(
                            request.SourceEventType),
                    SourceEntityId =
                        request.SourceEntityId,
                    RecipientAddress =
                        request.RecipientAddress.Trim(),
                    ProtectedEmailPayload =
                        _protector.Protect(payload),
                    Message = string.Empty,
                    Status =
                        NotificationStatus.Pending,
                    RetryCount = 0
                });
    }

    private static NotificationSourceEventType
        MapEventType(
            string sourceEventType)
        =>
            Enum.TryParse<
                NotificationSourceEventType>(
                sourceEventType,
                ignoreCase: false,
                out var parsed)
                ? parsed
                : throw new
                    ArgumentOutOfRangeException(
                        nameof(sourceEventType),
                        sourceEventType,
                        "No NotificationSourceEventType matches. Check NotificationEvents in BuildingBlocks.");
}

public sealed record EmailAttachmentPayload(
    string FileName,
    string ContentType,
    string Base64Content);

public sealed record EmailPayload(
    string Subject,
    string HtmlBody,
    IReadOnlyList<EmailAttachmentPayload>? Attachments = null);
