using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.API.Persistence;

public sealed partial class DemoDataSeeder
{
    // Explicit Development command only. These are synthetic legacy fixtures, not gateway payments.
    public async Task SeedMemberCalendarAsync(CancellationToken ct = default)
    {
        var member = await db.UserAccounts.Include(u => u.Role).SingleOrDefaultAsync(u => u.Email == "an.member@sporthub.vn", ct)
            ?? throw new InvalidOperationException("Demo Member an.member@sporthub.vn does not exist. Seed the base demo dataset first.");
        var manager = await db.UserAccounts.SingleOrDefaultAsync(u => u.Email == "manager@sporthub.vn", ct)
            ?? throw new InvalidOperationException("Demo manager does not exist.");
        if (member.Status != UserStatus.Active || member.Role?.RoleName != UserRole.Member)
            throw new InvalidOperationException("Demo account must be an active Member.");
        var today = VietnamTime.TodayLocal(clock);
        var now = clock.UtcNow;
        var prefix = $"DEMO-CALENDAR-{today:yyyyMM}";
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var rooms = new Dictionary<int, Room>();
        foreach (var sport in new[] { 3, 4 })
        {
            var badminton = sport == 3;
            var label = badminton ? "Cầu lông" : "Bóng rổ";
            var room = await EnsureDemoRoomAsync($"Demo Calendar · {label}", sport, 20, ct)
                ?? throw new InvalidOperationException("Demo court type is unavailable.");
            var coach = await EnsureDemoCoachAsync($"calendar.coach{sport}@sporthub.vn", $"Coach Demo · {label}", $"090299000{sport}", sport, ct)
                ?? throw new InvalidOperationException("Demo coach is unavailable.");
            rooms[sport] = room;
            var code = $"{prefix}-{sport}";
            await SeedPublishedShowcaseCourseAsync(code, $"{label} · Lớp demo Calendar", sport, coach.UserId, room.RoomId,
                NextWeekday(today.AddDays(2), badminton ? DayOfWeek.Monday : DayOfWeek.Tuesday), badminton
                    ? [(DayOfWeek.Monday, new TimeOnly(8, 0)), (DayOfWeek.Wednesday, new TimeOnly(8, 0))]
                    : [(DayOfWeek.Tuesday, new TimeOnly(9, 0)), (DayOfWeek.Thursday, new TimeOnly(9, 0))],
                6, badminton ? 90 : 120, 20, 600_000m, 1_200_000m, now, ct, allowExistingPublished: true);
            var course = await db.Classes.SingleAsync(c => c.Code == code, ct);
            if (!await db.Enrollments.AnyAsync(e => e.ClassId == course.ClassId && e.MemberId == member.UserId, ct))
            {
                var holdId = Guid.NewGuid();
                var item = await AddCalendarDemoInvoiceAsync(member.UserId, manager.UserId, course.Price,
                    InvoiceItemType.ClassPackage, holdId, $"Calendar demo · {label} · 6 buổi", now, ct);
                db.Set<SeatHold>().Add(new SeatHold { HoldId = holdId, ClassId = course.ClassId, MemberId = member.UserId,
                    InvoiceId = item.InvoiceId, Status = SeatHoldStatus.Converted, CreatedAt = now, ExpiresAtUtc = now });
                db.Enrollments.Add(new Enrollment { EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId,
                    MemberId = member.UserId, InvoiceItemId = item.ItemId, Status = EnrollmentStatus.Confirmed, EnrolledAt = now });
                course.ConfirmedCount++;
                course.ReservedCount++;
                await db.SaveChangesAsync(ct);
            }
        }
        foreach (var index in Enumerable.Range(0, 4))
        {
            var reference = $"{prefix}-RENTAL-{index}";
            if (await db.InvoiceItems.AnyAsync(i => i.Description == reference, ct)) continue;
            var sport = index % 2 == 0 ? 3 : 4;
            var room = rooms[sport];
            var start = VietnamTime.StartOfDayUtc(today.AddDays(3 + index * 4)).AddHours(17);
            // Shared room ledger is authoritative, even for fixtures.
            if (await db.RoomOccupancies.AnyAsync(o => o.IsActive && o.RoomId == room.RoomId && o.StartAtUtc < start.AddHours(1) && o.EndAtUtc > start, ct))
                throw new InvalidOperationException("Demo rental slot is already occupied; no fixtures were committed.");
            var rentalId = Guid.NewGuid();
            var item = await AddCalendarDemoInvoiceAsync(member.UserId, manager.UserId, 100_000m,
                InvoiceItemType.Rental, rentalId, reference, now, ct);
            var blocks = new[] { new CourtRentalBlockPrice(start, start.AddHours(1), 100_000m) };
            db.Set<CourtRental>().Add(new CourtRental { CourtRentalId = rentalId, MemberId = member.UserId,
                SportId = sport, RoomId = room.RoomId, StartAtUtc = start, EndAtUtc = start.AddHours(1),
                TotalPrice = 100_000m, PriceSnapshotJson = System.Text.Json.JsonSerializer.Serialize(blocks),
                Status = CourtRentalStatus.Confirmed, InvoiceId = item.InvoiceId, InvoiceItemId = item.ItemId, CreatedAtUtc = now });
            db.RoomOccupancies.Add(new RoomOccupancy { OccupancyId = Guid.NewGuid(), RoomId = room.RoomId,
                SourceType = OccupancySourceType.CourtRental, SourceId = rentalId, StartAtUtc = start,
                EndAtUtc = start.AddHours(1), IsActive = true });
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        logger.LogInformation("Calendar demo ready for an.member@sporthub.vn: two enrolled courses and four court bookings ({Month}).", prefix);
    }

    private async Task<InvoiceItem> AddCalendarDemoInvoiceAsync(Guid member, Guid manager, decimal amount,
        InvoiceItemType type, Guid relatedId, string description, DateTime now, CancellationToken ct)
    {
        var invoice = new Invoice { InvoiceId = Guid.NewGuid(), InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = member, IssuedByUserId = manager, TotalAmount = amount, CashAmount = amount,
            Status = InvoiceStatus.Paid, IssuedAt = now };
        var item = new InvoiceItem { ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = type,
            RelatedEntityId = relatedId, Description = description, UnitPrice = amount, Quantity = 1, LineAmount = amount };
        db.Invoices.Add(invoice);
        db.InvoiceItems.Add(item);
        db.Payments.Add(new Payment.Domain.Entities.Payment { PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
            Amount = amount, Method = PaymentMethod.Cash, Status = PaymentStatus.Success, ReceivedByUserId = manager, PaidAt = now });
        await db.SaveChangesAsync(ct);
        return item;
    }
}
