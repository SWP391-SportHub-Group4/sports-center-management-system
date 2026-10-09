using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class NotificationActionTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Invoice_notice_links_to_owned_invoice_and_rejects_foreign_or_missing_sources()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100000);
        var foreign = await factory.SeedInvoiceAsync(other.UserId, other.UserId, 100000);
        var sources = new[] { invoice.InvoiceId, foreign.InvoiceId, Guid.NewGuid() };
        await factory.QueryAsync(async db =>
        {
            foreach (var source in sources)
                db.Notifications.Add(new()
                {
                    NotificationId = Guid.NewGuid(), UserId = member.UserId,
                    SourceEventType = NotificationSourceEventType.InvoiceCreated,
                    SourceEntityId = source, Message = "Invoice ready", Channel = NotificationChannel.InApp,
                    Status = NotificationStatus.Sent, SentAt = DateTime.UtcNow
                });
            return await db.SaveChangesAsync();
        });
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        var rows = await client.GetFromJsonAsync<List<Notice>>("/api/notifications");
        Assert.NotNull(rows);
        Assert.Equal($"/member/invoices/{invoice.InvoiceId}", rows.Single(x => x.SourceEntityId == invoice.InvoiceId).ActionUrl);
        Assert.Null(rows.Single(x => x.SourceEntityId == foreign.InvoiceId).ActionUrl);
        Assert.Null(rows.Single(x => x.SourceEntityId == sources[2]).ActionUrl);
        using var otherClient = factory.CreateApiClient(other.UserId, UserRole.Member);
        Assert.Empty((await otherClient.GetFromJsonAsync<List<Notice>>("/api/notifications"))!);
    }

    private sealed record Notice(Guid SourceEntityId, string? ActionUrl);
}
