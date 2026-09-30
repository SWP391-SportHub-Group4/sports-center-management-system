using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class SeatHoldConcurrencyTests(SchedulingApiFactory factory)
{
    private async Task<T> InTransaction<T>(Func<IClassEnrollmentFulfillment, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        var result = await action(scope.ServiceProvider.GetRequiredService<IClassEnrollmentFulfillment>());
        await tx.CommitAsync();
        return result;
    }

    private Task<ClassSeatReservation> Reserve(int classId, Guid member)
        => InTransaction(s => s.ReserveAsync(classId, member, null, DateTimeOffset.UtcNow.AddMinutes(15)));

    [Fact]
    public async Task Concurrent_members_cannot_exceed_capacity()
    {
        var c = await CourseTestData.CreateAsync(factory, capacity: 1);
        var a = await factory.SeedUserAsync(UserRole.Member);
        var b = await factory.SeedUserAsync(UserRole.Member);
        var attempts = await Task.WhenAll(new[] { a, b }.Select(async member =>
        {
            try { await Reserve(c.Id, member.UserId); return "reserved"; }
            catch (ConflictException ex) { return ex.ErrorCode; }
        }));
        Assert.Single(attempts, s => s == "reserved");
        Assert.Single(attempts, s => s == "class_full");
        Assert.Equal(1, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.ReservedCount).SingleAsync()));
        Assert.Equal(1, await factory.QueryAsync(db => db.SeatHolds.CountAsync(x => x.ClassId == c.Id && x.Status == SeatHoldStatus.Active)));
    }

    [Fact]
    public async Task Concurrent_overlapping_courses_for_same_member_only_one_reserves()
    {
        var a = await CourseTestData.CreateAsync(factory);
        var b = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var attempts = await Task.WhenAll(new[] { a, b }.Select(async c =>
        {
            try { await Reserve(c.Id, member.UserId); return "reserved"; }
            catch (ConflictException ex) { return ex.ErrorCode; }
        }));
        Assert.Single(attempts, s => s == "reserved");
        Assert.Single(attempts, s => s == "member_schedule_conflict");
    }

    [Fact]
    public async Task Active_hold_prevents_reschedule_from_creating_member_conflict()
    {
        var a = await CourseTestData.CreateAsync(factory);
        var b = await CourseTestData.CreateAsync(factory, time: "12:00");
        var member = await factory.SeedUserAsync(UserRole.Member);
        await Reserve(a.Id, member.UserId);
        await Reserve(b.Id, member.UserId);
        var first = (await CourseTestData.SessionsAsync(factory, a.Id))[0];
        var target = (await CourseTestData.SessionsAsync(factory, b.Id))[0];
        var ex = await Assert.ThrowsAsync<ConflictException>(() => CourseTestData.RunAsync<IClassSessionService, object>(factory,
            async s => await s.RescheduleAsync(first.SessionId, new() { StartAtUtc = target.StartAtUtc, Reason = "Đổi lịch" }, a.ManagerId)));
        Assert.Equal("member_schedule_conflict", ex.ErrorCode);
    }

    [Fact]
    public async Task Confirm_and_release_are_idempotent_and_expiry_returns_capacity_once()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var hold = await Reserve(c.Id, member.UserId);
        // Payment owns whether an item was paid; use a persisted legacy item to exercise the fulfillment port.
        var itemId = await factory.QueryAsync(async db =>
        {
            var invoice = new Invoice { InvoiceId = Guid.NewGuid(), InvoiceNumber = "T-" + Guid.NewGuid().ToString("N"), MemberId = member.UserId,
                IssuedByUserId = c.ManagerId, TotalAmount = 100_000, CashAmount = 100_000, Status = InvoiceStatus.Paid, IssuedAt = DateTime.UtcNow };
            var item = new InvoiceItem { ItemId = Guid.NewGuid(), Invoice = invoice, Description = "Fulfillment test", UnitPrice = 100_000, Quantity = 1, LineAmount = 100_000 };
            db.InvoiceItems.Add(item); await db.SaveChangesAsync(); return item.ItemId;
        });
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => InTransaction(s => s.ConfirmAsync(hold.SeatHoldId, itemId))));
        Assert.Equal(results[0], results[1]);
        var counts = await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => new { x.ConfirmedCount, x.ReservedCount }).SingleAsync());
        Assert.Equal(1, counts.ConfirmedCount); Assert.Equal(1, counts.ReservedCount);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var expiring = await Reserve(c.Id, other.UserId);
        await factory.QueryAsync(db => db.SeatHolds.Where(h => h.HoldId == expiring.SeatHoldId).ExecuteUpdateAsync(s => s.SetProperty(h => h.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1))));
        await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => CourseTestData.RunAsync<SeatHoldService, object>(factory, async s => await s.ExpireDueAsync())));
        await InTransaction(async s => { await s.ReleaseAsync(expiring.SeatHoldId); await s.ReleaseAsync(expiring.SeatHoldId); return 0; });
        Assert.Equal(SeatHoldStatus.Expired, await factory.QueryAsync(db => db.SeatHolds.Where(h => h.HoldId == expiring.SeatHoldId).Select(h => h.Status).SingleAsync()));
        Assert.Equal(1, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.ReservedCount).SingleAsync()));
    }

    [Fact]
    public async Task Completed_first_session_closes_sales_even_when_class_job_is_late()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var first = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        await factory.QueryAsync(db => db.ClassSessions.Where(s => s.SessionId == first.SessionId).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.StartAtUtc, DateTime.UtcNow.AddHours(-2)).SetProperty(x => x.EndAtUtc, DateTime.UtcNow.AddMinutes(-30))
            .SetProperty(x => x.Status, ClassSessionStatus.Completed)));
        Assert.Equal("class_started", (await Assert.ThrowsAsync<ConflictException>(() => Reserve(c.Id, member.UserId))).ErrorCode);
        Assert.Equal(0, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.ReservedCount).SingleAsync()));
    }
}
