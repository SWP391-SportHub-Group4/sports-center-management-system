using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Application.Services;
using SportHub.Notification.Domain.Enums;
using SportHub.Notification.Infrastructure;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class OutboxDispatchTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Failure_preserves_encrypted_payload_and_retry_delivers_once_then_clears_it()
    {
        var source = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var protection = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>();
        new NotificationWriter(db, protection).QueueEmail(new(null, $"{source:N}@example.test",
            NotificationEvents.ManualNotice, source, "Outbox test", "<p>Private body 123456</p>"));
        await db.SaveChangesAsync();
        var sender = new ControlledSender();
        var clock = new MutableClock(DateTime.UtcNow.AddHours(1));
        var dispatcher = new EmailDispatchService(db, sender, protection, clock, NullLogger<EmailDispatchService>.Instance);
        await dispatcher.DispatchBatchAsync();
        db.ChangeTracker.Clear();
        var failed = await db.Notifications.AsNoTracking().SingleAsync(x => x.SourceEntityId == source);
        Assert.Equal(NotificationStatus.Failed, failed.Status);
        Assert.DoesNotContain("123456", failed.ProtectedEmailPayload!);
        Assert.Equal(nameof(InvalidOperationException), failed.LastError);
        sender.Fail = false;
        clock.UtcNow = clock.UtcNow.AddHours(2);
        await dispatcher.DispatchBatchAsync();
        db.ChangeTracker.Clear();
        var sent = await db.Notifications.AsNoTracking().SingleAsync(x => x.SourceEntityId == source);
        Assert.Equal(NotificationStatus.Sent, sent.Status);
        Assert.Null(sent.ProtectedEmailPayload);
        Assert.NotNull(sent.SentAt);
        await dispatcher.DispatchBatchAsync();
        Assert.Single(sender.Delivered, x => x == $"{source:N}@example.test");
    }

    [Fact]
    public async Task Rolled_back_action_leaves_no_email_to_dispatch()
    {
        var source = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            new NotificationWriter(db, scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>())
                .QueueEmail(new(null, "rollback@example.test", NotificationEvents.ManualNotice, source, "Rollback", "Body"));
            await db.SaveChangesAsync();
            await tx.RollbackAsync();
        }
        Assert.False(await factory.QueryAsync(d => d.Notifications.AnyAsync(x => x.SourceEntityId == source)));
    }

    private sealed class MutableClock(DateTime now) : IClock { public DateTime UtcNow { get; set; } = now; }
    private sealed class ControlledSender : IEmailSender
    {
        public bool Fail { get; set; } = true;
        public List<string> Delivered { get; } = [];
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            if (Fail) throw new InvalidOperationException("SMTP test failure");
            Delivered.Add(to);
            return Task.CompletedTask;
        }
    }
}
