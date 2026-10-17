using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Jobs;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using NotificationEntity = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class OperationsHealthTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Health_endpoint_reports_a_stuck_outbox_row_and_is_manager_only()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var anonymous = factory.CreateApiClient();
        using var asMember = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var asManager = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/manager/operations/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await asMember.GetAsync("/api/manager/operations/health")).StatusCode);

        var before = await Read(asManager);

        // An in-app notification that has failed past the retry alert, and one whose send lease expired mid-send.
        await factory.QueryAsync(async db =>
        {
            db.Notifications.AddRange(
                new NotificationEntity
                {
                    NotificationId = Guid.NewGuid(), UserId = member.UserId, Channel = NotificationChannel.InApp,
                    SourceEventType = NotificationSourceEventType.ManualNotice, SourceEntityId = Guid.NewGuid(),
                    Message = "health probe", Status = NotificationStatus.Failed, RetryCount = 5
                },
                new NotificationEntity
                {
                    NotificationId = Guid.NewGuid(), UserId = member.UserId, Channel = NotificationChannel.InApp,
                    SourceEventType = NotificationSourceEventType.ManualNotice, SourceEntityId = Guid.NewGuid(),
                    Message = "health probe", Status = NotificationStatus.Sending,
                    DispatchLeaseUntilUtc = DateTime.UtcNow.AddMinutes(-10)
                });
            await db.SaveChangesAsync();
            return 0;
        });

        var after = await Read(asManager);
        Assert.Equal(before.failedNeedingAttention + 1, after.failedNeedingAttention);
        Assert.Equal(before.stuckSending + 1, after.stuckSending);
        Assert.NotEqual("Healthy", after.status);
    }

    private static async Task<(string status, int failedNeedingAttention, int stuckSending)> Read(HttpClient client)
    {
        var response = await client.GetAsync("/api/manager/operations/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = (await response.Content.ReadFromJsonAsync<JsonElement>());
        var outbox = json.GetProperty("outbox");
        Assert.True(json.TryGetProperty("jobs", out _));
        Assert.True(json.TryGetProperty("payments", out var payments));
        Assert.True(payments.TryGetProperty("manualCompensationRequired", out _));
        return (json.GetProperty("status").GetString()!, outbox.GetProperty("failedNeedingAttention").GetInt32(),
            outbox.GetProperty("stuckSending").GetInt32());
    }

    [Fact]
    public void A_job_that_keeps_failing_or_goes_silent_is_flagged_and_recovers_on_success()
    {
        var registry = new JobHealthRegistry();
        registry.Register("ReconcileJob", TimeSpan.FromMinutes(1));
        var now = DateTime.UtcNow;

        registry.RunSucceeded("ReconcileJob");
        Assert.False(registry.Snapshot(now).Single().Unhealthy);

        for (var i = 0; i < 3; i++) registry.RunFailed("ReconcileJob", new InvalidOperationException("db down"));
        var failing = registry.Snapshot(now).Single();
        Assert.True(failing.Unhealthy);
        Assert.Equal(3, failing.ConsecutiveFailures);
        Assert.Contains("db down", failing.LastError);

        registry.RunSucceeded("ReconcileJob");
        Assert.False(registry.Snapshot(now).Single().Unhealthy);

        // Silent for longer than three intervals even though nothing threw.
        Assert.True(registry.Snapshot(now.AddMinutes(10)).Single().Unhealthy);
    }
}
