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
    [InlineData(false)]
    [InlineData(true)]
    public async Task Unpaid_transfer_expires_refunds_source_and_compensates_late_cash_without_reviving_enrollment(bool retry)
    {
        var source = await CourseTestData.CreateAsync(factory);
        var target = await CourseTestData.CreateAsync(factory, time: "14:00");
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(x => x.ClassId == source.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CostAmount, 200_000m).SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.Classes.Where(x => x.ClassId == target.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Price, 120_000m));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                await scope.ServiceProvider.GetRequiredService<IPointWalletService>().EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
                await tx.CommitAsync();
            }
            var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .CreateClassAsync(new(source.Id, null), Guid.NewGuid().ToString(), member.UserId, false, default);
            await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(checkout.InvoiceId, 100, member.UserId, default);
            await scope.ServiceProvider.GetRequiredService<CheckoutService>().StartPaymentAsync(checkout.InvoiceId, member.UserId, false, "127.0.0.1", default);
        }
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
        var response = await factory.QueryAsync(db => db.Set<ThresholdResponse>().AsNoTracking()
            .SingleAsync(x => x.ClassId == source.Id && x.MemberId == member.UserId));
        var token = await factory.QueryAsync(async db => (await db.Notifications
            .Where(x => x.SourceEntityId == response.ThresholdResponseId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.InApp).Select(x => x.Message).SingleAsync()).Split("token=")[1]);
        Guid invoiceId;
        using (var scope = factory.Services.CreateScope())
        {
            var result = await scope.ServiceProvider.GetRequiredService<ThresholdResponseService>()
                .RespondAsync(token, ThresholdResponseChoice.Transfer, target.Id, member.UserId);
            invoiceId = result.AdditionalInvoiceId!.Value;
        }
        if (retry)
        {
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
                await using var tx = await db.Database.BeginTransactionAsync();
                await scope.ServiceProvider.GetRequiredService<CheckoutService>().ReleaseForSystemAsync(invoiceId, "Expired", default);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            using var scope2 = factory.Services.CreateScope();
            var result = await scope2.ServiceProvider.GetRequiredService<ThresholdResponseService>()
                .RespondAsync(token, ThresholdResponseChoice.Transfer, target.Id, member.UserId);
            Assert.NotEqual(invoiceId, result.AdditionalInvoiceId);
            invoiceId = result.AdditionalInvoiceId!.Value;
        }
        string reference;
        using (var scope = factory.Services.CreateScope())
        {
            var attempt = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .StartPaymentAsync(invoiceId, member.UserId, false, "127.0.0.1", default);
            reference = attempt.TransactionReference!;
        }
        Assert.True(await factory.QueryAsync(db => db.Enrollments.AnyAsync(x => x.MemberId == member.UserId
            && x.ClassId == source.Id && x.Status == EnrollmentStatus.Confirmed)));
        using (var scope = factory.Services.CreateScope())
            await ActivatorUtilities.CreateInstance<ThresholdResponseExpiryService>(scope.ServiceProvider,
                new TestClock(response.DeadlineUtc.AddSeconds(1))).ExpireAsync();
        var mock = Assert.IsType<SportHub.Payment.VnPay.MockPaymentGateway>(
            factory.Services.GetRequiredService<SportHub.Payment.VnPay.IPaymentGateway>());
        var callback = mock.BuildCallback(reference, 20_000m, true);
        for (var i = 0; i < 2; i++)
        {
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>().ReceiveCallbackAsync(callback, default);
        }
        await factory.QueryAsync(async db =>
        {
            Assert.False(await db.Enrollments.AnyAsync(x => x.MemberId == member.UserId && x.Status == EnrollmentStatus.Confirmed));
            Assert.Equal(120, await db.PointWallets.Where(x => x.OwnerUserId == member.UserId).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(0, await db.PointWallets.Where(x => x.OwnerUserId == member.UserId).Select(x => x.HeldPoints).SingleAsync());
            Assert.Equal(ThresholdResolutionStatus.Expired, await db.Set<ThresholdResponse>()
                .Where(x => x.ThresholdResponseId == response.ThresholdResponseId).Select(x => x.ResolutionStatus).SingleAsync());
            Assert.Equal("Compensated", await db.VerifiedGatewayEvents.Where(x => x.TransactionReference == reference)
                .Select(x => x.ProcessingStatus).SingleAsync());
            Assert.Equal(0, await db.Classes.Where(x => x.ClassId == target.Id).Select(x => x.ReservedCount).SingleAsync());
            return 0;
        });
    }

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
            var message = await db.Notifications.Where(x => x.SourceEntityId == response.ThresholdResponseId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.InApp).Select(x => x.Message).SingleAsync();
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
