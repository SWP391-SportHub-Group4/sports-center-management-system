using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed record CourtCalendarSlot(DateTime StartUtc, DateTime EndUtc, string Status,
    decimal? TotalPrice, IReadOnlyList<CourtRentalBlockPrice> Blocks);
public sealed record CourtCalendarRoom(int RoomId, string Name, IReadOnlyList<CourtCalendarSlot> Slots);
public sealed record CourtCalendarDay(int SportId, DateOnly Date, DateTime ServerNowUtc,
    IReadOnlyList<CourtCalendarRoom> Rooms);

public sealed partial class CourtRentalService
{
    public async Task<CourtCalendarDay> CalendarAsync(Guid memberId, int sportId, DateOnly date, int hours, CancellationToken ct)
    {
        var access = await users.GetAsync(memberId, ct);
        if (access is null || !access.IsActive || access.Role != "Member")
            throw new ForbiddenException("member_inactive", "Chỉ Member đang hoạt động mới được thuê sân.");
        if (!await catalog.IsServiceEnabledAsync(sportId, SportServiceType.CourtRental, ct))
            throw new BadRequestException("rental_not_available", "Môn này không có dịch vụ thuê sân.");
        var step = await settings.GetIntAsync(SystemSettingKeys.RentalSlotMinutes, ct);
        var maxHours = await settings.GetIntAsync(SystemSettingKeys.RentalMaxHours, ct);
        var advanceDays = await settings.GetIntAsync(SystemSettingKeys.RentalAdvanceDays, ct);
        var holdMinutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        var now = clock.UtcNow;
        if (step is not (30 or 60) || hours < 1 || hours > maxHours || hours > 4
            || date < VietnamTime.TodayLocal(clock) || date > VietnamTime.TodayLocal(clock).AddDays(advanceDays))
            throw new BadRequestException("invalid_rental_window", "Ngày hoặc thời lượng thuê không hợp lệ.");

        var rooms = await (from room in db.Set<Room>().AsNoTracking()
                           join link in db.Set<SportRoomType>().AsNoTracking() on room.RoomTypeId equals link.RoomTypeId
                           where room.IsActive && link.SportId == sportId
                           select new { room.RoomId, room.Name, room.RoomTypeId }).Distinct().OrderBy(r => r.Name).ToListAsync(ct);
        var ids = rooms.Select(r => r.RoomId).ToList();
        var typeIds = rooms.Select(r => r.RoomTypeId).ToList();
        var opening = await db.Set<RoomOpeningHour>().AsNoTracking()
            .Where(h => ids.Contains(h.RoomId) && h.DayOfWeek == (int)date.DayOfWeek).ToListAsync(ct);
        var from = VietnamTime.StartOfDayUtc(date);
        var to = VietnamTime.EndOfDayExclusiveUtc(date);
        // Only time and state leave the API; no other customer's identity or booking ID is exposed.
        var busy = await db.Set<RoomOccupancy>().AsNoTracking()
            .Where(o => o.IsActive && ids.Contains(o.RoomId) && o.StartAtUtc < to && o.EndAtUtc > from)
            .Select(o => new { o.RoomId, o.SourceId, o.SourceType, o.StartAtUtc, o.EndAtUtc }).ToListAsync(ct);
        var rentalIds = busy.Where(o => o.SourceType == OccupancySourceType.CourtRental).Select(o => o.SourceId).ToList();
        var rentalStates = await db.Set<CourtRental>().AsNoTracking().Where(r => rentalIds.Contains(r.CourtRentalId))
            .Select(r => new { r.CourtRentalId, r.Status }).ToDictionaryAsync(r => r.CourtRentalId, r => r.Status, ct);
        var rates = await db.Set<CourtRate>().AsNoTracking().Where(r => r.IsActive
            && typeIds.Contains(r.RoomTypeId) && (r.SportId == null || r.SportId == sportId)).ToListAsync(ct);
        var result = new List<CourtCalendarRoom>();
        foreach (var room in rooms)
        {
            var slots = new List<CourtCalendarSlot>();
            var window = opening.SingleOrDefault(h => h.RoomId == room.RoomId);
            if (window is not null)
            {
                var openMinute = window.OpenTimeLocal.Hour * 60 + window.OpenTimeLocal.Minute;
                var closeMinute = window.CloseTimeLocal.Hour * 60 + window.CloseTimeLocal.Minute;
                for (var minute = (int)Math.Ceiling(openMinute / (double)step) * step;
                     minute + hours * 60 <= closeMinute; minute += step)
                {
                    var start = from.AddMinutes(minute);
                    var end = start.AddHours(hours);
                    var occupied = busy.FirstOrDefault(o => o.RoomId == room.RoomId && o.StartAtUtc < end && o.EndAtUtc > start);
                    var status = occupied is null ? "AVAILABLE" : occupied.SourceType switch
                    {
                        OccupancySourceType.CourtRental when rentalStates.GetValueOrDefault(occupied.SourceId) == CourtRentalStatus.PendingPayment => "HELD",
                        OccupancySourceType.CourtRental => "BOOKED",
                        OccupancySourceType.RoomBlock => "BLOCKED",
                        _ => "SCHEDULED"
                    };
                    if (occupied is null && (start <= now.AddMinutes(holdMinutes) || start > now.AddDays(advanceDays)))
                        status = "UNAVAILABLE";
                    CourtRentalQuote? quote = null;
                    if (status == "AVAILABLE")
                    {
                        try { quote = CourtRateCalculator.Calculate(rates.Where(r => r.RoomTypeId == room.RoomTypeId), sportId,
                            new DateTimeOffset(start), TimeSpan.FromHours(hours), step); }
                        catch (ConflictException) { status = "NO_RATE"; }
                    }
                    slots.Add(new CourtCalendarSlot(start, end, status, quote?.TotalPrice, quote?.Blocks ?? []));
                }
            }
            result.Add(new CourtCalendarRoom(room.RoomId, room.Name, slots));
        }
        return new CourtCalendarDay(sportId, date, now, result);
    }
}
