using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;

namespace SportHub.Payment.Application.Services;

/// <summary>Queues financial receipts in the caller transaction. Network delivery belongs to the outbox worker.</summary>
public sealed class PaymentNoticeService(IUserAccessReader users, INotificationWriter notifications)
{
    public async Task QueueAsync(Guid ownerId, string eventType, Guid eventId, string message, CancellationToken ct)
    {
        notifications.Queue(new NotificationRequest(ownerId, eventType, message, eventId));
        var recipient = await users.GetAsync(ownerId, ct);
        if (recipient is not null)
            notifications.QueueEmail(new EmailNotificationRequest(ownerId, recipient.Email, eventType, eventId,
                "SportHub - Thông báo giao dịch", "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
    }

    public Task CreatedAsync(Invoice invoice, CancellationToken ct)
        => QueueAsync(invoice.MemberId, NotificationEvents.InvoiceCreated, invoice.InvoiceId,
            $"Hóa đơn {invoice.InvoiceNumber}: {invoice.TotalAmount:N0} VND. Vui lòng thanh toán trước khi hết hạn giữ chỗ.", ct);
}
