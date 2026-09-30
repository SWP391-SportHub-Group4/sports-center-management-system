using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ThresholdTransferTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(80_000)]
    [InlineData(100_000)]
    [InlineData(120_000)]
    public async Task Transfer_preserves_paid_value_and_repeated_choice_is_idempotent(int targetPrice)
    {
        var source = await CourseTestData.CreateAsync(factory);
        var target = await CourseTestData.CreateAsync(factory, time: "14:00");
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == source.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CostAmount, 200_000m).SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.Classes.Where(x => x.ClassId == target.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Price, targetPrice));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                await scope.ServiceProvider.GetRequiredService<IPointWalletService>().EarnAsync(new(member.UserId, 200, "TestCredit", Guid.NewGuid()));
                await tx.CommitAsync();
            }
            var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .CreateClassAsync(new(source.Id, null), Guid.NewGuid().ToString(), member.UserId, false, default);
            await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(checkout.InvoiceId, 100, member.UserId, default);
            await scope.ServiceProvider.GetRequiredService<CheckoutService>().StartPaymentAsync(checkout.InvoiceId, member.UserId, false, "127.0.0.1", default);
        }
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        var token = await factory.QueryAsync(async db =>
        {
            var response = await db.Set<ThresholdResponse>().SingleAsync(x => x.ClassId == source.Id && x.MemberId == member.UserId);
            var message = await db.Notifications.Where(x => x.SourceEntityId == response.ThresholdResponseId).Select(x => x.Message).SingleAsync();
            return message.Split("token=")[1];
        });
        using var work = factory.Services.CreateScope();
        var service = work.ServiceProvider.GetRequiredService<ThresholdResponseService>();
        await Assert.ThrowsAsync<ForbiddenException>(() => service.RespondAsync(token, ThresholdResponseChoice.Transfer, target.Id, source.ManagerId));
        var result = await service.RespondAsync(token, ThresholdResponseChoice.Transfer, target.Id, member.UserId);
        Assert.Equal(result, await service.RespondAsync(token, ThresholdResponseChoice.Transfer, target.Id, member.UserId));
        if (targetPrice > 100_000)
        {
            Assert.NotNull(result.AdditionalInvoiceId);
            await work.ServiceProvider.GetRequiredService<PointConfirmationService>()
                .SelectSelfAsync(result.AdditionalInvoiceId.Value, 20, member.UserId, default);
            await work.ServiceProvider.GetRequiredService<CheckoutService>()
                .StartPaymentAsync(result.AdditionalInvoiceId.Value, member.UserId, false, "127.0.0.1", default);
        }
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(1, await db.Enrollments.CountAsync(x => x.MemberId == member.UserId && x.ClassId == target.Id && x.Status == EnrollmentStatus.Confirmed));
            Assert.Equal(0, await db.Enrollments.CountAsync(x => x.MemberId == member.UserId && x.ClassId == source.Id && x.Status == EnrollmentStatus.Confirmed));
            var wallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == member.UserId);
            Assert.Equal(200 - targetPrice / 1000, wallet.AvailablePoints);
            Assert.Equal(0, wallet.HeldPoints);
            return 0;
        });
    }
}
