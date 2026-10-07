using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Application;

/// <summary>Bản cài đặt <see cref="ISchedulingAvailabilityReader"/>: đọc cùng bảng occupancy mà OccupancyService ghi.</summary>
public sealed class SchedulingAvailabilityReader(ISportHubDbContext db) : ISchedulingAvailabilityReader
{
    public async Task<IReadOnlyList<TimeWindow>> GetCoachBusyAsync(
        Guid coachId, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var from = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var to = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        return await db.Set<CoachOccupancy>().AsNoTracking()
            .Where(o => o.IsActive && o.CoachId == coachId && o.StartAtUtc < to && o.EndAtUtc > from)
            .OrderBy(o => o.StartAtUtc)
            .Select(o => new TimeWindow(o.StartAtUtc, o.EndAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RoomAvailability>> GetServiceRoomsAsync(
        SportServiceType serviceType, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var from = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var to = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        var rooms = await (from room in db.Set<Room>().AsNoTracking()
                           join link in db.Set<ServiceRoomType>().AsNoTracking() on room.RoomTypeId equals link.RoomTypeId
                           join offering in db.Set<SportServiceOffering>().AsNoTracking() on link.OfferingId equals offering.OfferingId
                           join sport in db.Set<Sport>().AsNoTracking() on offering.SportId equals sport.SportId
                           where room.IsActive && offering.ServiceType == serviceType && offering.IsEnabled && sport.IsActive
                           select new { room.RoomId, room.Name })
            .Distinct()
            .OrderBy(r => r.Name)
            .ToListAsync(cancellationToken);

        if (rooms.Count == 0)
        {
            return [];
        }

        var ids = rooms.Select(r => r.RoomId).ToList();
        var hours = await db.Set<RoomOpeningHour>().AsNoTracking()
            .Where(h => ids.Contains(h.RoomId))
            .ToListAsync(cancellationToken);
        var busy = await db.Set<RoomOccupancy>().AsNoTracking()
            .Where(o => o.IsActive && ids.Contains(o.RoomId) && o.StartAtUtc < to && o.EndAtUtc > from)
            .Select(o => new { o.RoomId, o.StartAtUtc, o.EndAtUtc })
            .ToListAsync(cancellationToken);

        return rooms.Select(r => new RoomAvailability(
            r.RoomId,
            r.Name,
            hours.Where(h => h.RoomId == r.RoomId)
                .Select(h => new RoomOpeningDay(h.DayOfWeek, h.OpenTimeLocal, h.CloseTimeLocal)).ToList(),
            busy.Where(b => b.RoomId == r.RoomId).Select(b => new TimeWindow(b.StartAtUtc, b.EndAtUtc)).ToList()))
            .ToList();
    }
}
