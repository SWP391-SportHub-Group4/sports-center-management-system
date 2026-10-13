using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;

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
                    Channel =
                        NotificationChannel.InApp,
                    SourceEventType =
                        MapEventType(
                            request.SourceEventType),
                    SourceEntityId =
                        request.SourceEntityId,
                    Message = request.Message,
                    Status =
                        NotificationStatus.Pending,
                    RetryCount = 0
                });
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
            request.Attachments ?? [];

        var totalAttachmentBytes =
            attachments.Sum(
                x => x.Content?.Length ?? 0);

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
                attachment.Content is null ||
                attachment.Content.Length == 0)
            {
                throw new ArgumentException(
                    "Email attachment is invalid.",
                    nameof(request));
            }
        }

        var eventType =
            MapEventType(
                request.SourceEventType);

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
                    NotificationId =
                        Guid.NewGuid(),
                    UserId = request.UserId,
                    Channel =
                        NotificationChannel.Email,
                    SourceEventType =
                        eventType,
                    SourceEntityId =
                        request.SourceEntityId,
                    RecipientAddress =
                        request.RecipientAddress
                            .Trim(),
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