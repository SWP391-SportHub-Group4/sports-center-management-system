using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Jobs;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class MemberCourseNotificationsTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Reminder_targets_only_active_enrollments_and_scheduled_future_sessions_and_deduplicates()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var active = await factory.SeedUserAsync(UserRole.Member);
        var ended = await factory.SeedUserAsync(UserRole.Member);
        var now = DateTime.UtcNow;
        var sessionId = await factory.QueryAsync(async db =>
        {
            foreach (var (memberId, status) in new[] { (active.UserId, EnrollmentStatus.Confirmed), (ended.UserId, EnrollmentStatus.Refunded) })
                db.Enrollments.Add(new Enrollment { EnrollmentId = Guid.NewGuid(), MemberId = memberId,
                    ClassId = course.Id, Status = status, EnrolledAt = now });
            var session = await db.ClassSessions.Where(x => x.ClassId == course.Id).OrderBy(x => x.StartAtUtc).FirstAsync();
            session.StartAtUtc = now.AddHours(2);
            session.EndAtUtc = now.AddHours(3);
            await db.SaveChangesAsync();
            return session.SessionId;
        });
        await QueueAsync();
        await QueueAsync();
        var recipients = await factory.QueryAsync(db => db.Notifications.Where(x => x.SourceEventType == NotificationSourceEventType.ClassSessionReminder
            && x.SourceEntityId == sessionId).Select(x => x.UserId).ToListAsync());
        Assert.Equal(active.UserId, Assert.Single(recipients));
        using var client = factory.CreateApiClient(active.UserId, UserRole.Member);
        var feed = await client.GetFromJsonAsync<JsonElement>("/api/notifications");
        Assert.Contains(feed.EnumerateArray(), row => row.GetProperty("sourceEventType").GetString() == "CLASS_SESSION_REMINDER"
            && row.GetProperty("actionUrl").GetString()!.Contains(sessionId.ToString()));
    }

    private async Task QueueAsync()
    {
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<MemberCourseNotificationService>().QueueDueAsync();
    }
}
