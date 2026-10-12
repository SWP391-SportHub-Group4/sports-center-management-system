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
    public async Task Membership_purchases_use_paid_at_distinct_members_and_fulfilled_invoices()
    {
        var day = new DateOnly(2042, 4, 12);
        var from = VietnamTime.StartOfDayUtc(day);
        var members = new List<Guid>();
        for (var i = 0; i < 8; i++)
            members.Add((await factory.SeedUserAsync(UserRole.Member)).UserId);

        await factory.QueryAsync(async db =>
        {
            void Add(int member, DateTime? paidAt, SportHub.Payment.Domain.Enums.InvoiceStatus status,
                string? paidVia, SportHub.Payment.Domain.Enums.InvoiceItemType kind, int points = 0)
            {
                var invoice = new SportHub.Payment.Domain.Entities.Invoice
                {
                    InvoiceId = Guid.NewGuid(), InvoiceNumber = "MP-" + Guid.NewGuid().ToString("N"),
                    MemberId = members[member], IssuedByUserId = members[member],
                    TotalAmount = 100000, CashAmount = 100000 - points * 1000,
                    PointsApplied = points, Status = status, PaidVia = paidVia,
                    IssuedAt = from.AddDays(-10), PaidAtUtc = paidAt
                };
                invoice.Items.Add(new SportHub.Payment.Domain.Entities.InvoiceItem
                {
                    ItemId = Guid.NewGuid(), ItemType = kind, Description = "Report fixture",
                    UnitPrice = 100000, Quantity = 1, LineAmount = 100000
                });
                db.Invoices.Add(invoice);
            }
            var paid = SportHub.Payment.Domain.Enums.InvoiceStatus.Paid;
            var membership = SportHub.Payment.Domain.Enums.InvoiceItemType.Membership;
            var reconciled = SportHub.Payment.Domain.Enums.InvoiceStatus.PaidAfterReconciliation;
            Add(0, from, paid, "VnPay", membership);
            Add(0, from.AddHours(2), paid, "VnPay", membership);
            Add(1, from.AddDays(1).AddTicks(-10), paid, "Points", membership, 100);
            Add(2, from.AddHours(3), reconciled, "VnPayAfterReconciliation", membership);
            Add(3, from.AddDays(1), paid, "VnPay", membership);
            Add(4, null, paid, "VnPay", membership);
            Add(5, from.AddHours(1), SportHub.Payment.Domain.Enums.InvoiceStatus.Issued, null, membership);
            Add(6, from.AddHours(1), reconciled, "VnPayCompensated", membership);
            Add(7, from.AddHours(1), paid, "VnPay", SportHub.Payment.Domain.Enums.InvoiceItemType.Rental);
            Add(7, from.AddTicks(-10), paid, "VnPay", membership);
            await db.SaveChangesAsync();
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IMembershipReportService>();
        Assert.Equal(3, (await service.GetPeriodAsync(day, day)).MembersPurchasingMembershipInPeriod);
        Assert.Equal(0, (await service.GetPeriodAsync(day.AddDays(-2), day.AddDays(-2))).MembersPurchasingMembershipInPeriod);
        Assert.Equal(4, (await service.GetPeriodAsync(day.AddDays(1), day)).MembersPurchasingMembershipInPeriod);
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
