using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ThresholdExpiryTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Late_evaluation_alerts_staff_without_opening_a_member_response_window()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(SportHub.Identity.Domain.Enums.UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1))));

        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IClassThresholdService>();
            Assert.Equal(1, await service.EvaluateDueAsync());
            Assert.Equal(0, await service.EvaluateDueAsync());
        }

        await factory.QueryAsync(async db =>
        {
            var state = await db.Classes.Where(x => x.ClassId == course.Id)
                .Select(x => new { x.Status, x.ThresholdStatus, x.ThresholdResponseDeadlineUtc }).SingleAsync();
            Assert.Equal(ClassStatus.Published, state.Status);
            Assert.Equal(ThresholdStatus.AtRisk, state.ThresholdStatus);
            Assert.Null(state.ThresholdResponseDeadlineUtc);
            Assert.False(await db.Set<ThresholdResponse>().AnyAsync(x => x.ClassId == course.Id));
            Assert.True(await db.Notifications.AnyAsync(x => x.UserId == course.ManagerId
                && x.SourceEventType == SportHub.Notification.Domain.Enums.NotificationSourceEventType.ClassThresholdAtRisk));
            Assert.False(await db.Notifications.AnyAsync(x => x.UserId == member.UserId
                && x.SourceEventType == SportHub.Notification.Domain.Enums.NotificationSourceEventType.ClassThresholdAtRisk));
            return 0;
        });
    }

    [Fact]
    public async Task Historical_response_deadline_still_closes_public_registration()
    {
        var course = await CourseTestData.CreateAsync(factory);
        await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ThresholdStatus, ThresholdStatus.AtRisk)
                .SetProperty(x => x.ThresholdResponseDeadlineUtc, DateTime.UtcNow.AddMinutes(-1))));
        using var scope = factory.Services.CreateScope();
        var publicCourse = await scope.ServiceProvider.GetRequiredService<IClassService>().GetPublicAsync(course.Id);
        Assert.True(publicCourse.ThresholdResponseClosed);
        Assert.False(publicCourse.EnrollmentOpen);
    }
}
