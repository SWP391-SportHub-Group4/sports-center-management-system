using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.API.Jobs;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassOpeningDecisionTests(SchedulingApiFactory factory)
{
    private async Task RunLifecycle()
    {
        using var scope = factory.Services.CreateScope();
        var job = new ClassStatusJob(factory.Services, NullLogger<ClassStatusJob>.Instance);
        await (Task)typeof(ClassStatusJob).GetMethod("RunOnceAsync", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(job, [scope.ServiceProvider, CancellationToken.None])!;
    }

    [Fact]
    public async Task Missed_opening_stays_unstarted_and_can_be_deferred_without_rewriting_teaching_history()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var member = await factory.SeedUserAsync(UserRole.Member);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var oldStart = DateTime.UtcNow.AddHours(-1);
        await factory.QueryAsync(async db => {
            await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u
                .SetProperty(x => x.BreakEvenThreshold, 2).SetProperty(x => x.ThresholdDeadlineUtc, oldStart.AddHours(-72)));
            await db.ClassSessions.Where(x => x.SessionId == s.SessionId).ExecuteUpdateAsync(u => u
                .SetProperty(x => x.StartAtUtc, oldStart).SetProperty(x => x.EndAtUtc, oldStart.AddMinutes(90)));
            return 0;
        });
        await RunLifecycle();
        await RunLifecycle();
        var course = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(x => x.ClassId == c.Id));
        Assert.Equal(ClassStatus.Published, course.Status);
        Assert.Equal(ThresholdStatus.AtRisk, course.ThresholdStatus);
        Assert.Null(course.ThresholdResponseDeadlineUtc);
        Assert.Equal(ClassSessionStatus.Scheduled, (await CourseTestData.SessionsAsync(factory, c.Id))[0].Status);
        Assert.Equal(0, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == member.UserId
            && n.SourceEventType == NotificationSourceEventType.ClassThresholdAtRisk)));
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using (var scope = factory.Services.CreateScope()) {
            var failure = await Assert.ThrowsAsync<ConflictException>(() => scope.ServiceProvider.GetRequiredService<IAttendanceService>()
                .MarkAsync(s.SessionId, enrollment, new() { Status = "Present" }, receptionist.UserId));
            Assert.Equal("class_opening_not_confirmed", failure.ErrorCode);
        }
        foreach (var kind in new[] { "RESULT", "HOMEWORK" }) {
            using var scope = factory.Services.CreateScope();
            var failure = await Assert.ThrowsAsync<ConflictException>(() => scope.ServiceProvider.GetRequiredService<ClassTeachingService>()
                .SaveAsync(c.Id, c.CoachId, new(Guid.NewGuid(), kind, "Do not teach yet", "Opening remains unconfirmed",
                    s.SessionId, member.UserId), false, default));
            Assert.Equal("class_opening_not_confirmed", failure.ErrorCode);
        }
        using (var scope = factory.Services.CreateScope())
            await Assert.ThrowsAsync<ConflictException>(() => scope.ServiceProvider.GetRequiredService<IClassThresholdService>()
                .WaiveAsync(c.Id, c.ManagerId, "Cannot approve a past opening"));
        var next = VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(new SystemClock()).AddDays(7)).AddHours(9);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassSessionService>().RescheduleAsync(s.SessionId,
                new() { StartAtUtc = next, Reason = "Defer unconfirmed opening after downtime" }, c.ManagerId);
        course = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(x => x.ClassId == c.Id));
        Assert.Equal(ThresholdStatus.NotEvaluated, course.ThresholdStatus);
        Assert.Equal(next.AddHours(-72), course.ThresholdDeadlineUtc);
        Assert.Equal(DateOnly.FromDateTime(VietnamTime.ToLocal(next)), course.StartDate);
        using var publicScope = factory.Services.CreateScope();
        Assert.False((await publicScope.ServiceProvider.GetRequiredService<IClassService>().GetPublicAsync(c.Id)).OpeningConfirmed);
    }

    [Fact]
    public async Task At_risk_alerts_staff_and_confirmation_notifies_all_roles_once()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var first = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var checkAt = first.StartAtUtc.AddHours(-72);
        await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u
            .SetProperty(x => x.BreakEvenThreshold, 2).SetProperty(x => x.ThresholdDeadlineUtc, checkAt)));
        using (var scope = factory.Services.CreateScope())
            await ActivatorUtilities.CreateInstance<ClassThresholdService>(scope.ServiceProvider, new TestClock(checkAt)).EvaluateDueAsync();
        var deadline = await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id)
            .Select(x => x.ThresholdResponseDeadlineUtc).SingleAsync());
        Assert.Null(deadline);
        foreach (var id in new[] { c.ManagerId, c.CoachId })
        {
            Assert.Equal(1, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == id
                && n.Channel == NotificationChannel.InApp
                && n.SourceEventType == NotificationSourceEventType.ClassThresholdAtRisk
                && n.SourceEntityId == first.SessionId)));
            Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == id
                && n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.ClassThresholdAtRisk)));
        }
        Assert.Equal(0, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == member.UserId
            && n.SourceEventType == NotificationSourceEventType.ClassThresholdAtRisk)));
        var second = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, second.UserId);
        var beforeConfirmation = new Dictionary<(Guid, NotificationChannel), int>();
        foreach (var id in new[] { member.UserId, second.UserId, c.ManagerId, c.CoachId })
            foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
                beforeConfirmation[(id, channel)] = await factory.QueryAsync(db => db.Notifications.CountAsync(n =>
                    n.UserId == id && n.Channel == channel && n.SourceEventType == NotificationSourceEventType.ClassThresholdConfirmed));
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            var service = scope.ServiceProvider.GetRequiredService<IClassThresholdService>();
            await service.ConfirmIfMetAsync(c.Id);
            await service.ConfirmIfMetAsync(c.Id);
            await tx.CommitAsync();
        }
        foreach (var id in new[] { member.UserId, second.UserId, c.ManagerId, c.CoachId })
            foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
                Assert.Equal(beforeConfirmation[(id, channel)] + 1, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == id
                    && n.Channel == channel && n.SourceEventType == NotificationSourceEventType.ClassThresholdConfirmed)));
        using var publicScope = factory.Services.CreateScope();
        Assert.True((await publicScope.ServiceProvider.GetRequiredService<IClassService>().GetPublicAsync(c.Id)).OpeningConfirmed);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Only_met_or_waived_classes_start_when_the_first_session_arrives(bool waive)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var status = waive ? ThresholdStatus.WaivedByManager : ThresholdStatus.Met;
        await factory.QueryAsync(async db => {
            await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.ThresholdStatus, status));
            await db.ClassSessions.Where(x => x.ClassId == c.Id && x.SessionNo == 1).ExecuteUpdateAsync(u => u
                .SetProperty(x => x.StartAtUtc, DateTime.UtcNow.AddMinutes(-30))
                .SetProperty(x => x.EndAtUtc, DateTime.UtcNow.AddMinutes(60)));
            return 0;
        });
        await RunLifecycle();
        Assert.Equal(ClassStatus.InProgress, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id)
            .Select(x => x.Status).SingleAsync()));
    }
}
