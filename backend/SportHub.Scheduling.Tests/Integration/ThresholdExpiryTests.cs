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
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Existing_response_still_expires_after_class_reaches_Met_or_is_waived(bool waive)
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
        var second = await BuyAsync(course.Id);
        using (var scope = factory.Services.CreateScope())
        {
            var thresholds = scope.ServiceProvider.GetRequiredService<IClassThresholdService>();
            if (waive) await thresholds.WaiveAsync(course.Id, course.ManagerId, "Manager commits to running course");
            await thresholds.EvaluateDueAsync();
        }
        Assert.Equal(waive ? ThresholdStatus.WaivedByManager : ThresholdStatus.Met,
            await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == course.Id).Select(x => x.ThresholdStatus).SingleAsync()));
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
            Assert.Equal(ThresholdResolutionStatus.Expired, await db.Set<ThresholdResponse>()
                .Where(x => x.ThresholdResponseId == pending.ThresholdResponseId).Select(x => x.ResolutionStatus).SingleAsync());
            Assert.Equal(100, await db.PointWallets.Where(x => x.OwnerUserId == first).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(waive ? 0 : 100, await db.PointWallets.Where(x => x.OwnerUserId == second).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(waive ? ClassStatus.Published : ClassStatus.Cancelled,
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
