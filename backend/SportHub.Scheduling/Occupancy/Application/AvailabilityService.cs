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

public sealed record ClassSlotAvailabilityResponse(
    bool Available, string? RoomName, string? CoachName, IReadOnlyList<string> Reasons);

public sealed record BusyIntervalResponse(string Resource, [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId, DateTime StartAtUtc, DateTime EndAtUtc);

/// <summary>
/// Gợi ý phòng/coach còn trống. Đọc cùng bảng occupancy mà <see cref="OccupancyService"/> ghi nên hai bên không lệch nhau.
/// Chỉ là gợi ý: POST đặt lịch vẫn chịu exclusion constraint của DB. Mọi truy vấn có giới hạn khoảng thời gian.
/// </summary>
public sealed class AvailabilityService(ISportHubDbContext db, ICoachSpecialtyReader coaches, IUserAccessReader users)
{
    public static readonly TimeSpan MaxSlotLength = TimeSpan.FromHours(12);
    public static readonly TimeSpan MaxBusyRange = TimeSpan.FromDays(31);

    /// <summary>Read-only Manager preview. Excludes only the scheduled class session being replaced.
    /// Confirmation still validates students, lifecycle and occupancy in its transaction.</summary>
    public async Task<ClassSlotAvailabilityResponse> CheckClassSlotAsync(
        int sportId, int roomId, Guid? coachId, int capacity, DateTime startUtc, DateTime endUtc,
        Guid? excludeSessionId = null, CancellationToken ct = default)
    {
        ValidateSlot(startUtc, endUtc);
        if (capacity < 1) throw new BadRequestException("invalid_capacity", "Sĩ số phải lớn hơn 0.");
        if (excludeSessionId.HasValue && !await db.Set<ClassSession>().AsNoTracking()
                .AnyAsync(s => s.SessionId == excludeSessionId && s.Class!.SportId == sportId
                    && s.Status == ClassSessionStatus.Scheduled, ct))
            throw new BadRequestException("invalid_preview_session", "Buổi được loại trừ không hợp lệ.");

        var start = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(endUtc, DateTimeKind.Utc);
        var reasons = new List<string>();
        var active = await db.Set<Sport>().AsNoTracking().Where(s => s.SportId == sportId)
            .Select(s => (bool?)s.IsActive).SingleOrDefaultAsync(ct);
        if (active is null) throw new NotFoundException("sport_not_found", "Không tìm thấy môn.");
        if (active == false) reasons.Add("sport_inactive");
        var room = await db.Set<Room>().AsNoTracking().SingleOrDefaultAsync(r => r.RoomId == roomId, ct);
        if (room is null) reasons.Add("room_not_found");
        else
        {
            if (!room.IsActive) reasons.Add("room_inactive");
            if (!await db.Set<SportRoomType>().AsNoTracking().AnyAsync(
                    l => l.RoomTypeId == room.RoomTypeId && l.SportId == sportId, ct))
                reasons.Add("room_incompatible");
            if (room.Capacity < capacity) reasons.Add("room_capacity_exceeded");
            var localStart = VietnamTime.ToLocal(start);
            var localEnd = VietnamTime.ToLocal(end);
            var hours = await db.Set<RoomOpeningHour>().AsNoTracking().SingleOrDefaultAsync(
                h => h.RoomId == roomId && h.DayOfWeek == (int)localStart.DayOfWeek, ct);
            if (hours is null || !RoomOpeningHourService.Covers(hours, localStart, localEnd))
                reasons.Add("outside_opening_hours");
            if (await db.Set<RoomOccupancy>().AsNoTracking().AnyAsync(o => o.IsActive
                    && o.RoomId == roomId && o.StartAtUtc < end && o.EndAtUtc > start
                    && !(excludeSessionId.HasValue && o.SourceType == OccupancySourceType.ClassSession
                        && o.SourceId == excludeSessionId), ct))
                reasons.Add("room_busy");
        }
        string? coachName = null;
        if (coachId is Guid id)
        {
            coachName = (await users.GetAsync(id, ct))?.FullName;
            if (!await coaches.IsActiveInternalCoachAsync(id, ct)) reasons.Add("coach_inactive");
            else if (!await coaches.HasSportAsync(id, sportId, ct)) reasons.Add("coach_specialty_mismatch");
            if (await db.Set<CoachOccupancy>().AsNoTracking().AnyAsync(o => o.IsActive
                    && o.CoachId == id && o.StartAtUtc < end && o.EndAtUtc > start
                    && !(excludeSessionId.HasValue && o.SourceType == OccupancySourceType.ClassSession
                        && o.SourceId == excludeSessionId), ct))
                reasons.Add("coach_busy");
        }
        else reasons.Add("coach_required");
        return new(reasons.Count == 0, room?.Name, coachName, reasons);
    }

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
