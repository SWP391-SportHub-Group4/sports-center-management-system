using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Entities;
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

    [Fact]
    public async Task Manager_support_notices_resolve_persisted_events_keep_closed_requests_and_fall_back_for_legacy_sources()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var anotherManager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var requestId = Guid.NewGuid();
        var reminderId = Guid.NewGuid(); var reportId = Guid.NewGuid(); var foreignReminderId = Guid.NewGuid();
        var notices = new[]
        {
            (Id: Guid.NewGuid(), User: manager.UserId, Type: NotificationSourceEventType.SupportSlaReminder, Source: (Guid?)reminderId),
            (Id: Guid.NewGuid(), User: manager.UserId, Type: NotificationSourceEventType.SupportPayoutNotReceived, Source: (Guid?)reportId),
            (Id: Guid.NewGuid(), User: manager.UserId, Type: NotificationSourceEventType.SupportPayoutNotReceived, Source: (Guid?)Guid.NewGuid()),
            (Id: Guid.NewGuid(), User: manager.UserId, Type: NotificationSourceEventType.SupportSlaReminder, Source: (Guid?)null),
            (Id: Guid.NewGuid(), User: manager.UserId, Type: NotificationSourceEventType.SupportSlaReminder, Source: (Guid?)foreignReminderId),
            (Id: Guid.NewGuid(), User: member.UserId, Type: NotificationSourceEventType.SupportPayoutNotReceived, Source: (Guid?)reportId),
            (Id: Guid.NewGuid(), User: desk.UserId, Type: NotificationSourceEventType.SupportSlaReminder, Source: (Guid?)reminderId),
        };
        await factory.QueryAsync(async db =>
        {
            db.Set<MemberSupportRequest>().Add(new()
            {
                RequestId = requestId, MemberId = member.UserId, RecordedByUserId = member.UserId,
                Category = "PAYMENT", Subject = "Transfer review", Description = "Please check this transfer.",
                Status = "DONE", CreatedAt = DateTime.UtcNow.AddDays(-3), SlaDueAtUtc = DateTime.UtcNow.AddDays(-1),
                ClosedAt = DateTime.UtcNow, ProgressNote = "Review completed."
            });
            db.Set<MemberSupportEvent>().AddRange(
                new() { EventId = reminderId, RequestId = requestId, Type = "SLA_REMINDER_SENT", TargetUserId = manager.UserId, CreatedAt = DateTime.UtcNow },
                new() { EventId = foreignReminderId, RequestId = requestId, Type = "SLA_REMINDER_SENT", TargetUserId = anotherManager.UserId, CreatedAt = DateTime.UtcNow },
                new() { EventId = reportId, RequestId = requestId, Type = "MEMBER_REPORTED_NOT_RECEIVED", ActorUserId = member.UserId, CreatedAt = DateTime.UtcNow });
            foreach (var notice in notices)
                db.Notifications.Add(new()
                {
                    NotificationId = notice.Id, UserId = notice.User, SourceEventType = notice.Type, SourceEntityId = notice.Source,
                    Message = "Support notice", Channel = NotificationChannel.InApp, Status = NotificationStatus.Sent, SentAt = DateTime.UtcNow
                });
            return await db.SaveChangesAsync();
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var rows = (await client.GetFromJsonAsync<List<SupportNotice>>("/api/notifications"))!;
        string? Link(int index) => rows.Single(n => n.NotificationId == notices[index].Id).ActionUrl;
        Assert.Equal($"/manager/requests?type=support&overdue=1&request={requestId}", Link(0));
        Assert.Equal($"/manager/requests?type=support&request={requestId}", Link(1));
        Assert.Equal("/manager/requests?type=support", Link(2));
        Assert.Equal("/manager/requests?type=support&overdue=1", Link(3));
        Assert.Equal("/manager/requests?type=support&overdue=1", Link(4));
        Assert.DoesNotContain(rows, n => n.NotificationId == notices[5].Id || n.NotificationId == notices[6].Id);
        var detail = await client.GetFromJsonAsync<SupportNotice>($"/api/notifications/{notices[1].Id}");
        Assert.Equal(Link(1), detail!.ActionUrl);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var deskClient = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        Assert.Null((await memberClient.GetFromJsonAsync<List<SupportNotice>>("/api/notifications"))!
            .Single(n => n.NotificationId == notices[5].Id).ActionUrl);
        Assert.Null((await deskClient.GetFromJsonAsync<List<SupportNotice>>("/api/notifications"))!
            .Single(n => n.NotificationId == notices[6].Id).ActionUrl);
        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await memberClient.GetAsync($"/api/notifications/{notices[1].Id}")).StatusCode);
        Assert.Equal("DONE", await factory.QueryAsync(db => db.Set<MemberSupportRequest>().Where(r => r.RequestId == requestId).Select(r => r.Status).SingleAsync()));
    }

    [Fact]
    public async Task Unactivated_payment_links_managers_and_invoice_owner_only_and_keeps_resolved_history_accessible()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100000);
        var eventId = Guid.NewGuid();
        var missing = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            var attemptId = Guid.NewGuid();
            db.PaymentAttempts.Add(new()
            {
                PaymentAttemptId = attemptId, InvoiceId = invoice.InvoiceId,
                VnpTxnRef = Guid.NewGuid().ToString("N"), Amount = 100000,
                CreatedAt = DateTime.UtcNow, VnpExpireDate = DateTime.UtcNow.AddMinutes(15)
            });
            db.VerifiedGatewayEvents.Add(new()
            {
                VerifiedGatewayEventId = eventId, PaymentAttemptId = attemptId,
                ProviderTransactionId = Guid.NewGuid().ToString("N"), TransactionReference = Guid.NewGuid().ToString("N"),
                Amount = 100000, ResponseCode = "00", TransactionStatus = "00",
                ProviderPaidAtUtc = DateTime.UtcNow, VerifiedAtUtc = DateTime.UtcNow,
                ProcessingStatus = "ConvertedToPoints"
            });
            foreach (var user in new[] { member.UserId, manager.UserId, other.UserId, admin.UserId, desk.UserId })
                foreach (var source in new[] { eventId, missing })
                    db.Notifications.Add(new()
                    {
                        NotificationId = Guid.NewGuid(), UserId = user, SourceEntityId = source,
                        SourceEventType = NotificationSourceEventType.PaymentUnactivated,
                        Message = "Payment needs review", Channel = NotificationChannel.InApp,
                        Status = NotificationStatus.Sent, SentAt = DateTime.UtcNow
                    });
            return await db.SaveChangesAsync();
        });
        foreach (var user in new[] { member, manager, other, admin, desk })
        {
            var role = user.UserId == manager.UserId ? UserRole.CenterManager
                : user.UserId == admin.UserId ? UserRole.SystemAdministrator
                : user.UserId == desk.UserId ? UserRole.Receptionist : UserRole.Member;
            using var client = factory.CreateApiClient(user.UserId, role);
            var rows = (await client.GetFromJsonAsync<List<SupportNotice>>("/api/notifications"))!;
            var notice = rows.Single(x => x.SourceEntityId == eventId);
            var expected = role == UserRole.CenterManager ? $"/manager/finance?invoiceId={invoice.InvoiceId}"
                : user.UserId == member.UserId ? $"/member/invoices/{invoice.InvoiceId}" : null;
            Assert.Equal(expected, notice.ActionUrl);
            Assert.Null(rows.Single(x => x.SourceEntityId == missing).ActionUrl);
            Assert.Equal(expected, (await client.GetFromJsonAsync<SupportNotice>($"/api/notifications/{notice.NotificationId}"))!.ActionUrl);
        }
    }

    private sealed record SupportNotice(Guid NotificationId, Guid? SourceEntityId, string? ActionUrl);
    private sealed record Notice(Guid SourceEntityId, string? ActionUrl);
}
