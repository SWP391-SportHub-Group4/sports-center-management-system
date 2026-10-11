using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ReportPeriodAndHoldsTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task New_members_period_uses_Vietnam_midnight_half_open_boundaries()
    {
        var day = new DateOnly(2040, 4, 12);
        var from = VietnamTime.StartOfDayUtc(day);
        var first = await factory.SeedUserAsync(UserRole.Member);
        var last = await factory.SeedUserAsync(UserRole.Member);
        var next = await factory.SeedUserAsync(UserRole.Member);
        await factory.QueryAsync(async db =>
        {
            await db.UserAccounts.Where(x => x.UserId == first.UserId).ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, from));
            await db.UserAccounts.Where(x => x.UserId == last.UserId).ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, from.AddDays(1).AddSeconds(-1)));
            await db.UserAccounts.Where(x => x.UserId == next.UserId).ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, from.AddDays(1)));
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<IMembershipReportService>().GetPeriodAsync(day, day);
        Assert.Equal(2, result.NewMembers);
    }

    [Fact]
    public async Task Enrollment_report_excludes_expired_holds_before_cleanup_job_runs()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var first = await factory.SeedUserAsync(UserRole.Member);
        var second = await factory.SeedUserAsync(UserRole.Member);
        var now = new DateTime(2031, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await factory.QueryAsync(async db =>
        {
            db.Set<SeatHold>().AddRange(
                new SeatHold { HoldId = Guid.NewGuid(), ClassId = course.Id, MemberId = first.UserId,
                    Status = SeatHoldStatus.Active, ExpiresAtUtc = now, CreatedAt = now.AddMinutes(-5) },
                new SeatHold { HoldId = Guid.NewGuid(), ClassId = course.Id, MemberId = second.UserId,
                    Status = SeatHoldStatus.Active, ExpiresAtUtc = now.AddMinutes(1), CreatedAt = now.AddMinutes(-5) });
            await db.Classes.Where(x => x.ClassId == course.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReservedCount, 2));
            await db.SaveChangesAsync();
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        var reports = new ClassEnrollmentReportService(scope.ServiceProvider.GetRequiredService<SportHubDbContext>(), new TestClock(now));
        var result = await reports.GetAsync(CourseTestData.StartDate, CourseTestData.StartDate, 3);
        var row = Assert.Single(result.Classes, x => x.ClassId == course.Id);
        Assert.Equal(1, row.ActiveHoldCount);
        Assert.Equal(3, row.AvailableSeats);
        Assert.Equal(0, row.ConfirmedCount);
    }
}
