using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class AutomaticEnrollmentTests(SchedulingApiFactory factory)
{
    private async Task<Guid> BuyAsync(int classId)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await scope.ServiceProvider.GetRequiredService<IPointWalletService>()
                .EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var checkout = scope.ServiceProvider.GetRequiredService<CheckoutService>();
        var invoice = await checkout.CreateClassAsync(new(classId, null), Guid.NewGuid().ToString(), member.UserId, false, default);
        await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(invoice.InvoiceId, 100, member.UserId, default);
        await checkout.StartPaymentAsync(invoice.InvoiceId, member.UserId, false, "127.0.0.1", default);
        return member.UserId;
    }

    [Fact]
    public async Task Publishing_opens_enrollment_without_a_separate_manager_action()
    {
        var c = await CourseTestData.CreateAsync(factory, publish: false);
        Assert.False(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.EnrollmentOpen).SingleAsync()));
        var result = await CourseTestData.RunAsync<IClassService, SportHub.Scheduling.Application.DTOs.ClassManagerResponse>(factory,
            s => s.PublishAsync(c.Id, new(), c.ManagerId));
        Assert.True(result.EnrollmentOpen);
        Assert.Null(result.EnrollmentClosedReason);
        Assert.Null(result.EnrollmentClosedAtUtc);
        await BuyAsync(c.Id);
        Assert.Equal(1, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.ConfirmedCount).SingleAsync()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Last_paid_student_closes_enrollment_without_overbooking(bool concurrent)
    {
        var c = await CourseTestData.CreateAsync(factory, capacity: 2);
        if (concurrent) await Task.WhenAll(BuyAsync(c.Id), BuyAsync(c.Id));
        else
        {
            await BuyAsync(c.Id);
            Assert.True(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.EnrollmentOpen).SingleAsync()));
            await BuyAsync(c.Id);
        }
        var row = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(x => x.ClassId == c.Id));
        Assert.Equal(2, row.ConfirmedCount);
        Assert.Equal(2, row.ReservedCount);
        Assert.False(row.EnrollmentOpen);
        Assert.Equal("Class is full.", row.EnrollmentClosedReason);
        Assert.NotNull(row.EnrollmentClosedAtUtc);
        var newcomer = await factory.SeedUserAsync(UserRole.Member);
        var error = await Assert.ThrowsAsync<ConflictException>(() => CourseTestData.RunAsync<IClassEnrollmentFulfillment, ClassQuote>(factory,
            s => s.QuoteAsync(c.Id, newcomer.UserId)));
        Assert.Equal("class_full", error.ErrorCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Withdrawal_reopens_a_full_class_only_before_it_starts(bool started)
    {
        var c = await CourseTestData.CreateAsync(factory, capacity: 1);
        var member = await BuyAsync(c.Id);
        var item = await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == c.Id && e.MemberId == member)
            .Select(e => e.InvoiceItemId).SingleAsync());
        if (started)
            await factory.QueryAsync(db => db.ClassSessions.Where(s => s.ClassId == c.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartAtUtc, DateTime.UtcNow.AddHours(-2))
                    .SetProperty(x => x.EndAtUtc, DateTime.UtcNow.AddHours(-1))));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        var service = scope.ServiceProvider.GetRequiredService<IClassEnrollmentFulfillment>();
        await service.CancelAsync(item!.Value, EnrollmentEndReason.Refunded);
        await service.CancelAsync(item.Value, EnrollmentEndReason.Refunded);
        await tx.CommitAsync();
        var row = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(x => x.ClassId == c.Id));
        Assert.Equal(0, row.ConfirmedCount);
        Assert.Equal(0, row.ReservedCount);
        Assert.Equal(!started, row.EnrollmentOpen);
        if (!started)
        {
            Assert.Null(row.EnrollmentClosedReason);
            Assert.Null(row.EnrollmentClosedAtUtc);
            await BuyAsync(c.Id);
            Assert.False(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.EnrollmentOpen).SingleAsync()));
        }
    }

    [Fact]
    public async Task Temporary_hold_does_not_close_enrollment_and_release_restores_availability()
    {
        var c = await CourseTestData.CreateAsync(factory, capacity: 1);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var fulfillment = scope.ServiceProvider.GetRequiredService<IClassEnrollmentFulfillment>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            var hold = await fulfillment.ReserveAsync(c.Id, member.UserId, null, DateTimeOffset.UtcNow.AddMinutes(15));
            Assert.True(await db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.EnrollmentOpen).SingleAsync());
            await fulfillment.ReleaseAsync(hold.SeatHoldId);
            await tx.CommitAsync();
        }
        await BuyAsync(c.Id);
        Assert.False(await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.EnrollmentOpen).SingleAsync()));
    }
}
