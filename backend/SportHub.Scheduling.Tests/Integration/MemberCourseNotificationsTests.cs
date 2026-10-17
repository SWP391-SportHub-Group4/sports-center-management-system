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
    public async Task Wait_next_course_refunds_once_ends_access_and_subscribes_to_future_openings()
    {
        var source = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == source.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CostAmount, 200_000m).SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var db = sp.GetRequiredService<SportHubDbContext>();
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                await sp.GetRequiredService<IPointWalletService>().EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
                await tx.CommitAsync();
            }
            var checkout = await sp.GetRequiredService<CheckoutService>().CreateClassAsync(new(source.Id, null),
                Guid.NewGuid().ToString(), member.UserId, false, default);
            await sp.GetRequiredService<PointConfirmationService>().SelectSelfAsync(checkout.InvoiceId, 100, member.UserId, default);
            await sp.GetRequiredService<CheckoutService>().StartPaymentAsync(checkout.InvoiceId, member.UserId, false, "127.0.0.1", default);
        }
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        var response = await factory.QueryAsync(db => db.Set<ThresholdResponse>()
            .SingleAsync(x => x.ClassId == source.Id && x.MemberId == member.UserId));
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        for (var i = 0; i < 2; i++)
        {
            var result = await client.PostAsJsonAsync($"/api/class-threshold-responses/{response.ThresholdResponseId}",
                new { choice = "WAIT_NEXT_COURSE" });
            Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        }
        var interest = await factory.QueryAsync(db => db.Set<CourseInterest>().SingleAsync(x => x.MemberId == member.UserId));
        Assert.Equal(100, interest.RefundedPoints);
        var mine = await client.GetFromJsonAsync<JsonElement>("/api/course-interests");
        Assert.Equal(1, mine.GetProperty("totalCount").GetInt32());
        Assert.Equal(100, mine.GetProperty("items")[0].GetProperty("refundedPoints").GetInt32());
        using var manager = factory.CreateApiClient(source.ManagerId, UserRole.CenterManager);
        var managed = await manager.GetFromJsonAsync<JsonElement>("/api/course-interests?sportId=3");
        Assert.Contains(managed.GetProperty("items").EnumerateArray(), row => row.GetProperty("memberId").GetGuid() == member.UserId);
        Assert.False(await factory.QueryAsync(db => db.Enrollments.AnyAsync(x => x.MemberId == member.UserId
            && x.ClassId == source.Id && x.Status == EnrollmentStatus.Confirmed)));
        Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(x => x.OwnerUserId == member.UserId).Select(x => x.AvailablePoints).SingleAsync()));
        using var outsider = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        var otherList = await outsider.GetFromJsonAsync<JsonElement>("/api/course-interests");
        Assert.Equal(0, otherList.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.PostAsJsonAsync($"/api/course-interests/{interest.CourseInterestId}/cancel", new { })).StatusCode);
        var next = await CourseTestData.CreateAsync(factory, time: "14:00");
        // Only a cohort explicitly linked to this program fulfils the subscription.
        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == next.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ContinuationOfClassId, source.Id)));
        await QueueAsync();
        await QueueAsync();
        Assert.Equal(1, await OpeningCountAsync(member.UserId));
        Assert.Equal(1, await factory.QueryAsync(db => db.Notifications.CountAsync(x =>
            x.UserId == member.UserId && x.SourceEventType == NotificationSourceEventType.CourseInterestOpened
                && x.Channel == NotificationChannel.Email)));
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync($"/api/course-interests/{interest.CourseInterestId}/cancel", new { })).StatusCode);
        await CourseTestData.CreateAsync(factory, time: "16:00");
        await QueueAsync();
        Assert.Equal(1, await OpeningCountAsync(member.UserId));
    }

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

    private Task<int> OpeningCountAsync(Guid memberId) => factory.QueryAsync(db => db.Notifications.CountAsync(x =>
        x.UserId == memberId && x.SourceEventType == NotificationSourceEventType.CourseInterestOpened
            && x.Channel == NotificationChannel.InApp));
}
