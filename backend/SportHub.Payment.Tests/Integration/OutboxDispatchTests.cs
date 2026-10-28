using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
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
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Crypto_failures_identify_decryption_or_sender_stage_without_logging_private_content(bool wrongKey)
    {
        var source = Guid.NewGuid();
        var recipient = $"{source:N}@example.test";
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var writerKeys = new EphemeralDataProtectionProvider();
        var readerKeys = wrongKey ? new EphemeralDataProtectionProvider() : writerKeys;
        new NotificationWriter(db, writerKeys).QueueEmail(new(null, recipient,
            NotificationEvents.ManualNotice, source, "Diagnostics", "<p>secret-token-123</p>"));
        await db.SaveChangesAsync();
        var id = await db.Notifications.Where(x => x.SourceEntityId == source).Select(x => x.NotificationId).SingleAsync();
        var sender = new CryptoFailingSender();
        var logger = new CaptureLogger();
        var dispatcher = new EmailDispatchService(db, sender, readerKeys,
            new MutableClock(DateTime.UtcNow.AddHours(1)), logger);
        for (var batch = 0; batch < 20; batch++)
        {
            await dispatcher.DispatchBatchAsync();
            db.ChangeTracker.Clear();
            if (await db.Notifications.AnyAsync(x => x.NotificationId == id && x.Status == NotificationStatus.Failed)) break;
        }
        var row = await db.Notifications.AsNoTracking().SingleAsync(x => x.NotificationId == id);
        Assert.Equal(NotificationStatus.Failed, row.Status);
        Assert.Equal(nameof(CryptographicException), row.LastError);
        var entry = Assert.Single(logger.Entries.Where(message => message.Contains(id.ToString())));
        Assert.Contains(wrongKey ? "stage decrypt" : "stage send", entry);
        Assert.Contains("error CryptographicException", entry);
        Assert.DoesNotContain("secret-token-123", string.Join("\n", logger.Entries));
        Assert.DoesNotContain("private-provider-message", string.Join("\n", logger.Entries));
        Assert.Equal(!wrongKey, sender.Attempted.Contains(recipient));
    }

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
        // Other integration tests may leave email rows in this shared database. Drain
        // bounded batches until this notification is claimed by the dispatcher.
        async Task<NotificationStatus> DispatchUntilAsync(NotificationStatus expected)
        {
            NotificationStatus status = default;
            for (var batch = 0; batch < 20; batch++)
            {
                await dispatcher.DispatchBatchAsync();
                db.ChangeTracker.Clear();
                status = await db.Notifications.AsNoTracking().Where(x => x.SourceEntityId == source)
                    .Select(x => x.Status).SingleAsync();
                if (status == expected) break;
            }
            return status;
        }
        Assert.Equal(NotificationStatus.Failed, await DispatchUntilAsync(NotificationStatus.Failed));
        var failed = await db.Notifications.AsNoTracking().SingleAsync(x => x.SourceEntityId == source);
        Assert.DoesNotContain("123456", failed.ProtectedEmailPayload!);
        Assert.Equal(nameof(InvalidOperationException), failed.LastError);
        sender.Fail = false;
        clock.UtcNow = clock.UtcNow.AddHours(2);
        Assert.Equal(NotificationStatus.Sent, await DispatchUntilAsync(NotificationStatus.Sent));
        var sent = await db.Notifications.AsNoTracking().SingleAsync(x => x.SourceEntityId == source);
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
    private sealed class CaptureLogger : ILogger<EmailDispatchService>
    {
        public List<string> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? error, Func<TState, Exception?, string> formatter)
            => Entries.Add(formatter(state, error));
    }
    private sealed class CryptoFailingSender : IEmailSender
    {
        public List<string> Attempted { get; } = [];
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            Attempted.Add(to);
            throw new CryptographicException("private-provider-message");
        }
    }
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
