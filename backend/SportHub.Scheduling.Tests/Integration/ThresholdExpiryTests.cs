using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ThresholdExpiryTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Evaluation_too_close_to_first_session_alerts_manager_without_shortening_member_window()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var memberId = await BuyAsync(course.Id);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.ClassSessions.Where(x => x.ClassId == course.Id && x.SessionNo == 1)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartAtUtc, DateTime.UtcNow.AddHours(24)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        await factory.QueryAsync(async db =>
        {
            var state = await db.Classes.Where(x => x.ClassId == course.Id)
                .Select(x => new { x.ThresholdStatus, x.ThresholdResponseDeadlineUtc }).SingleAsync();
            Assert.Equal(ThresholdStatus.AtRisk, state.ThresholdStatus);
            Assert.Null(state.ThresholdResponseDeadlineUtc);
            Assert.False(await db.Set<ThresholdResponse>().AnyAsync(x => x.ClassId == course.Id && x.MemberId == memberId));
            Assert.True(await db.Notifications.AnyAsync(x => x.UserId == course.ManagerId
                && x.Message.Contains("cannot end 24 hours")));
            return 0;
        });
    }

    [Fact]
    public async Task Late_evaluation_gives_members_the_full_response_window()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var scheduledCheck = DateTime.UtcNow.AddMinutes(-5);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, scheduledCheck));
            return 0;
        });
        var memberId = await BuyAsync(course.Id);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();

        await factory.QueryAsync(async db =>
        {
            var response = await db.Set<ThresholdResponse>().AsNoTracking()
                .SingleAsync(x => x.ClassId == course.Id && x.MemberId == memberId);
            var stored = await db.Classes.Where(x => x.ClassId == course.Id)
                .Select(x => new { x.ThresholdDeadlineUtc, x.ThresholdResponseDeadlineUtc }).SingleAsync();
            Assert.True(response.DeadlineUtc >= stored.ThresholdDeadlineUtc!.Value.AddHours(48).AddMinutes(4));
            Assert.True(response.DeadlineUtc <= DateTime.UtcNow.AddHours(48));
            Assert.Equal(response.DeadlineUtc, stored.ThresholdResponseDeadlineUtc);
            return 0;
        });
    }

    [Fact]
    public async Task Keep_place_preserves_enrollment_until_final_decision_then_refunds_if_still_below()
    {
        var course = await CourseTestData.CreateAsync(factory);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CostAmount, 300_000m).SetProperty(x => x.BreakEvenThreshold, 3)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        var memberId = await BuyAsync(course.Id);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        var response = await factory.QueryAsync(db => db.Set<ThresholdResponse>().AsNoTracking()
            .SingleAsync(x => x.ClassId == course.Id && x.MemberId == memberId));
        var token = await factory.QueryAsync(async db => (await db.Notifications
            .Where(x => x.SourceEntityId == response.ThresholdResponseId
                && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.InApp)
            .Select(x => x.Message).SingleAsync()).Split("token=")[1]);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ThresholdResponseService>()
                .RespondAsync(token, ThresholdResponseChoice.KeepPlace, null, memberId);
        Assert.True(await factory.QueryAsync(db => db.Enrollments.AnyAsync(x => x.ClassId == course.Id
            && x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed)));

        using (var scope = factory.Services.CreateScope())
            await ActivatorUtilities.CreateInstance<ThresholdResponseExpiryService>(scope.ServiceProvider,
                new TestClock(response.DeadlineUtc.AddSeconds(1))).ExpireAsync();
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(ClassStatus.Cancelled, await db.Classes.Where(x => x.ClassId == course.Id)
                .Select(x => x.Status).SingleAsync());
            Assert.Equal(100, await db.PointWallets.Where(x => x.OwnerUserId == memberId)
                .Select(x => x.AvailablePoints).SingleAsync());
            return 0;
        });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Existing_response_does_not_refund_members_after_class_reaches_Met_or_is_waived(bool waive)
    {
        var course = await CourseTestData.CreateAsync(factory);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CostAmount, 200_000m).SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        var first = await BuyAsync(course.Id);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        var pending = await factory.QueryAsync(db => db.Set<ThresholdResponse>().AsNoTracking()
            .SingleAsync(x => x.ClassId == course.Id && x.MemberId == first));
        if (waive)
        {
            using var waiverScope = factory.Services.CreateScope();
            await waiverScope.ServiceProvider.GetRequiredService<IClassThresholdService>()
                .WaiveAsync(course.Id, course.ManagerId, "Manager commits to running course");
        }
        var second = await BuyAsync(course.Id);
        if (!waive)
            Assert.Equal(ThresholdStatus.Met, await factory.QueryAsync(db => db.Classes
                .Where(x => x.ClassId == course.Id).Select(x => x.ThresholdStatus).SingleAsync()));
        using (var scope = factory.Services.CreateScope())
        {
            var thresholds = scope.ServiceProvider.GetRequiredService<IClassThresholdService>();
            await thresholds.EvaluateDueAsync();
        }
        Assert.Equal(waive ? ThresholdStatus.WaivedByManager : ThresholdStatus.Met,
            await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.Id).Select(x => x.ThresholdStatus).SingleAsync()));
        using (var viewScope = factory.Services.CreateScope())
        {
            var view = await viewScope.ServiceProvider.GetRequiredService<ThresholdResponseService>()
                .GetAsync(pending.ThresholdResponseId, null, first, default);
            Assert.Equal(ThresholdResolutionStatus.Completed.ToString(), view.ResolutionStatus);
        }
        async Task Expire()
        {
            using var scope = factory.Services.CreateScope();
            var worker = ActivatorUtilities.CreateInstance<ThresholdResponseExpiryService>(scope.ServiceProvider,
                new TestClock(pending.DeadlineUtc.AddSeconds(1)));
            await worker.ExpireAsync();
        }
        await Task.WhenAll(Expire(), Expire());
        await Expire();
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(ThresholdResolutionStatus.Completed, await db.Set<ThresholdResponse>()
                .Where(x => x.ThresholdResponseId == pending.ThresholdResponseId).Select(x => x.ResolutionStatus).SingleAsync());
            Assert.Equal(0, await db.PointWallets.Where(x => x.OwnerUserId == first).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(0, await db.PointWallets.Where(x => x.OwnerUserId == second).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(ClassStatus.Published,
                await db.Classes.Where(x => x.ClassId == course.Id).Select(x => x.Status).SingleAsync());
            if (waive) Assert.Equal(ThresholdStatus.WaivedByManager,
                await db.Classes.Where(x => x.ClassId == course.Id).Select(x => x.ThresholdStatus).SingleAsync());
            return 0;
        });
    }

    private async Task<Guid> BuyAsync(int classId)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await scope.ServiceProvider.GetRequiredService<IPointWalletService>().EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var checkouts = scope.ServiceProvider.GetRequiredService<CheckoutService>();
        var checkout = await checkouts.CreateClassAsync(new(classId, null), Guid.NewGuid().ToString(), member.UserId, false, default);
        await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(checkout.InvoiceId, 100, member.UserId, default);
        await checkouts.StartPaymentAsync(checkout.InvoiceId, member.UserId, false, "127.0.0.1", default);
        return member.UserId;
    }
}
