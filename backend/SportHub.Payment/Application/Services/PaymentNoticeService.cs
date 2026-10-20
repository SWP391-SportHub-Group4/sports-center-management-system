using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

public sealed class PaymentNoticeService(
    IUserAccessReader users,
    INotificationWriter notifications,
    IInvoiceReceiptService receipts)
{
    public async Task QueueAsync(
        Guid ownerId,
        string eventType,
        Guid eventId,
        string message,
        CancellationToken ct, string? emailBody = null)
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
            return;

        notifications.QueueEmail(
            new EmailNotificationRequest(
                ownerId,
                recipient.Email,
                eventType,
                eventId,
                "SportHub - Transaction notice",
                emailBody ?? SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(message)));
    }

    public Task CreatedAsync(
        Invoice invoice,
        CancellationToken ct)
        =>
            QueueAsync(
                invoice.MemberId,
                NotificationEvents.InvoiceCreated,
                invoice.InvoiceId,
                $"Invoice {invoice.InvoiceNumber}: {invoice.TotalAmount:N0} VND. Please pay before the hold expires.",
                ct,
                SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph("Your invoice is ready. Please pay before the seat hold expires.")
                + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(
                    ("Invoice", invoice.InvoiceNumber), ("Total", $"{invoice.TotalAmount:N0} VND")));

    public async Task PaidReceiptAsync(
        Invoice invoice,
        CancellationToken ct)
    {
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

        if (recipient is null)
            return;

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
