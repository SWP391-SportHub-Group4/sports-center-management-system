using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Application;

public sealed record FreeRoomResponse(int RoomId, string Name, int? RoomTypeId, int Capacity);

public sealed record FreeCoachResponse(Guid CoachId, string FullName);

public sealed record BusyIntervalResponse(string Resource, string SourceType, Guid SourceId, DateTime StartAtUtc, DateTime EndAtUtc);

/// <summary>
/// Gợi ý phòng/coach còn trống. Đọc cùng bảng occupancy mà <see cref="OccupancyService"/> ghi nên hai bên không lệch nhau.
/// Chỉ là gợi ý: POST đặt lịch vẫn chịu exclusion constraint của DB. Mọi truy vấn có giới hạn khoảng thời gian.
/// </summary>
public sealed class AvailabilityService(ISportHubDbContext db, ICoachSpecialtyReader coaches, IUserAccessReader users)
{
    public static readonly TimeSpan MaxSlotLength = TimeSpan.FromHours(12);
    public static readonly TimeSpan MaxBusyRange = TimeSpan.FromDays(31);

    /// <summary>Phòng đang hoạt động, chơi được môn này, đang mở cửa trong cả khoảng, không có block/lịch chồng.</summary>
    public async Task<IReadOnlyList<FreeRoomResponse>> FreeRoomsAsync(
        int sportId, DateTime startUtc, DateTime endUtc, CancellationToken ct = default)
    {
        ValidateSlot(startUtc, endUtc);
        await EnsureSportActiveAsync(sportId, ct);

        var start = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(endUtc, DateTimeKind.Utc);

        var rooms = await (from room in db.Set<Room>().AsNoTracking()
                           join link in db.Set<SportRoomType>().AsNoTracking() on room.RoomTypeId equals link.RoomTypeId
                           where room.IsActive && link.SportId == sportId
                           select room).ToListAsync(ct);

        if (rooms.Count == 0)
        {
            return [];
        }

        var roomIds = rooms.Select(r => r.RoomId).ToList();
        var busy = (await db.Set<RoomOccupancy>().AsNoTracking()
                .Where(o => o.IsActive && roomIds.Contains(o.RoomId) && o.StartAtUtc < end && o.EndAtUtc > start)
                .Select(o => o.RoomId)
                .Distinct()
                .ToListAsync(ct))
            .ToHashSet();

        var localStart = VietnamTime.ToLocal(start);
        var localEnd = VietnamTime.ToLocal(end);
        var day = (int)localStart.DayOfWeek;

        var hours = (await db.Set<RoomOpeningHour>().AsNoTracking()
                .Where(h => roomIds.Contains(h.RoomId) && h.DayOfWeek == day)
                .ToListAsync(ct))
            .ToDictionary(h => h.RoomId);

        return rooms
            .Where(r => !busy.Contains(r.RoomId)
                        && hours.TryGetValue(r.RoomId, out var h)
                        && RoomOpeningHourService.Covers(h, localStart, localEnd))
            .OrderBy(r => r.Name)
            .Select(r => new FreeRoomResponse(r.RoomId, r.Name, r.RoomTypeId, r.Capacity))
            .ToList();
    }

    /// <summary>Coach nội bộ Active có chuyên môn môn này và không bị chiếm lịch trong khoảng (bất kể phòng).</summary>
    public async Task<IReadOnlyList<FreeCoachResponse>> FreeCoachesAsync(
        int sportId, DateTime startUtc, DateTime endUtc, CancellationToken ct = default)
    {
        ValidateSlot(startUtc, endUtc);
        await EnsureSportActiveAsync(sportId, ct);

        var start = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(endUtc, DateTimeKind.Utc);

        var candidates = await coaches.GetCoachIdsForSportAsync(sportId, ct);
        if (candidates.Count == 0)
        {
            return [];
        }

        var busy = (await db.Set<CoachOccupancy>().AsNoTracking()
                .Where(o => o.IsActive && candidates.Contains(o.CoachId) && o.StartAtUtc < end && o.EndAtUtc > start)
                .Select(o => o.CoachId)
                .Distinct()
                .ToListAsync(ct))
            .ToHashSet();

        var result = new List<FreeCoachResponse>();

        foreach (var id in candidates.Where(c => !busy.Contains(c)))
        {
            var info = await users.GetAsync(id, ct);
            result.Add(new FreeCoachResponse(id, info?.FullName ?? string.Empty));
        }

        return result.OrderBy(c => c.FullName).ToList();
    }

    /// <summary>Các khoảng phòng đang bị chiếm (lớp/PT/thuê sân/block) — chỉ cho nhân sự vận hành.</summary>
    public async Task<IReadOnlyList<BusyIntervalResponse>> RoomBusyAsync(
        int roomId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        if (toUtc <= fromUtc || toUtc - fromUtc > MaxBusyRange)
        {
            throw new BadRequestException("invalid_range", "Khoảng thời gian phải dương và tối đa 31 ngày.");
        }

        var from = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var to = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        var rows = await db.Set<RoomOccupancy>().AsNoTracking()
            .Where(o => o.IsActive && o.RoomId == roomId && o.StartAtUtc < to && o.EndAtUtc > from)
            .OrderBy(o => o.StartAtUtc)
            .ToListAsync(ct);

        return rows.Select(o => new BusyIntervalResponse(
                "Room", o.SourceType.ToString(), o.SourceId,
                DateTime.SpecifyKind(o.StartAtUtc, DateTimeKind.Utc), DateTime.SpecifyKind(o.EndAtUtc, DateTimeKind.Utc)))
            .ToList();
    }

    private async Task EnsureSportActiveAsync(int sportId, CancellationToken ct)
    {
        var active = await db.Set<Sport>().AsNoTracking().Where(s => s.SportId == sportId).Select(s => (bool?)s.IsActive).SingleOrDefaultAsync(ct);

        if (active is null)
        {
            throw new NotFoundException("sport_not_found", "Không tìm thấy môn.");
        }

        if (active == false)
        {
            throw new BadRequestException("sport_inactive", "Môn đã ngừng hoạt động.");
        }
    }

    private static void ValidateSlot(DateTime startUtc, DateTime endUtc)
    {
        if (endUtc <= startUtc || endUtc - startUtc > MaxSlotLength)
        {
            throw new BadRequestException("invalid_range", "Khoảng giờ phải dương và tối đa 12 giờ.");
        }
    }
}
