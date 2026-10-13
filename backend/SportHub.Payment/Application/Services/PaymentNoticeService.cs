using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Queues financial notifications and payment receipts in the caller transaction.
/// Network delivery is handled later by the notification outbox worker.
/// </summary>
public sealed class PaymentNoticeService(
    IUserAccessReader users,
    INotificationWriter notifications,
    IInvoiceReceiptService receipts)
{
    /// <summary>
    /// Generic financial notification.
    /// Used for invoice-created, refund, compensation, etc.
    /// </summary>
    public async Task QueueAsync(
        Guid ownerId,
        string eventType,
        Guid eventId,
        string message,
        CancellationToken ct)
    {
        notifications.Queue(
            new NotificationRequest(
                ownerId,
                eventType,
                message,
                eventId));

        var recipient =
            await users.GetAsync(
                ownerId,
                ct);

        if (recipient is null)
        {
            return;
        }

        notifications.QueueEmail(
            new EmailNotificationRequest(
                ownerId,
                recipient.Email,
                eventType,
                eventId,
                "SportHub - Transaction notice",
                "<p>" +
                System.Net.WebUtility.HtmlEncode(message) +
                "</p>"));
    }

    /// <summary>
    /// Invoice has been created but not necessarily paid yet.
    /// This remains a simple transaction notice, not a receipt.
    /// </summary>
    public Task CreatedAsync(
        Invoice invoice,
        CancellationToken ct)
        =>
            QueueAsync(
                invoice.MemberId,
                NotificationEvents.InvoiceCreated,
                invoice.InvoiceId,
                $"Invoice {invoice.InvoiceNumber}: {invoice.TotalAmount:N0} VND. Please pay before the hold expires.",
                ct);

    /// <summary>
    /// Generates and queues the real receipt only after checkout/payment
    /// has been successfully fulfilled.
    ///
    /// Includes:
    /// - in-app PaymentReceived notification
    /// - full HTML receipt
    /// - server-generated PDF receipt attachment
    /// </summary>
    public async Task PaidReceiptAsync(
        Invoice invoice,
        CancellationToken ct)
    {
        // In-app notification.
        notifications.Queue(
            new NotificationRequest(
                invoice.MemberId,
                NotificationEvents.PaymentReceived,
                $"Invoice {invoice.InvoiceNumber} was paid; the benefit was granted.",
                invoice.InvoiceId));

        var recipient =
            await users.GetAsync(
                invoice.MemberId,
                ct);

        // Member account might no longer be readable.
        // Payment itself must not fail because email cannot be prepared.
        if (recipient is null)
        {
            return;
        }

        // At this point PaymentFulfillmentService has already called SaveChangesAsync,
        // so the receipt service can query the final PAID state from the DB.
        var receipt =
            await receipts.BuildAsync(
                invoice.InvoiceId,
                ct);

        var pdf =
            receipts.RenderPdf(receipt);

        var html =
            receipts.RenderHtml(receipt);

        notifications.QueueEmail(
            new EmailNotificationRequest(
                invoice.MemberId,
                recipient.Email,
                NotificationEvents.PaymentReceived,
                invoice.InvoiceId,
                $"SportHub receipt - {invoice.InvoiceNumber}",
                html,
                [
                    new EmailAttachmentRequest(
                        $"{invoice.InvoiceNumber}.pdf",
                        "application/pdf",
                        pdf)
                ]));
    }
}