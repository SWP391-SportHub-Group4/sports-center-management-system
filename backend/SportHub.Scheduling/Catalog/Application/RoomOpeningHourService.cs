using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// Giờ mở cửa theo thứ của phòng (BR-109), giờ địa phương Asia/Ho_Chi_Minh. Mỗi phòng tối đa một khoảng mỗi ngày;
/// ngày không có dòng = đóng cửa. Đổi giờ mở cửa không sửa lịch đã đặt.
/// </summary>
public sealed class RoomOpeningHourService(ISportHubDbContext db, IAuditWriter audit)
{
    private const string TimeFormat = "HH:mm";

    public async Task<IReadOnlyList<OpeningHourResponse>> ListAsync(int roomId, CancellationToken ct = default)
    {
        await EnsureRoomAsync(roomId, ct);

        var rows = await db.Set<RoomOpeningHour>().AsNoTracking()
            .Where(h => h.RoomId == roomId).OrderBy(h => h.DayOfWeek).ToListAsync(ct);

        return rows.Select(ToResponse).ToList();
    }

    public async Task<IReadOnlyList<OpeningHourResponse>> SetAsync(
        int roomId, SetOpeningHoursRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await EnsureRoomAsync(roomId, ct);

        var parsed = new List<RoomOpeningHour>();

        foreach (var input in request.Hours)
        {
            var open = ParseTime(input.OpenTimeLocal);
            var close = ParseTime(input.CloseTimeLocal);

            if (close <= open)
            {
                throw new BadRequestException("invalid_opening_hours", "Giờ đóng cửa phải sau giờ mở cửa (trong cùng một ngày).");
            }

            parsed.Add(new RoomOpeningHour { RoomId = roomId, DayOfWeek = input.DayOfWeek, OpenTimeLocal = open, CloseTimeLocal = close });
        }

        if (parsed.Select(p => p.DayOfWeek).Distinct().Count() != parsed.Count)
        {
            throw new BadRequestException("duplicate_opening_day", "Mỗi ngày trong tuần chỉ được khai báo một khoảng giờ.");
        }

        var current = await db.Set<RoomOpeningHour>().Where(h => h.RoomId == roomId).ToListAsync(ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        db.Set<RoomOpeningHour>().RemoveRange(current);
        await db.SaveChangesAsync(ct);
        db.Set<RoomOpeningHour>().AddRange(parsed);

        audit.Write(new AuditEntry(actorUserId, "SET_ROOM_OPENING_HOURS", nameof(Room), roomId.ToString(),
            OldValue: Describe(current), NewValue: Describe(parsed)));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return parsed.OrderBy(p => p.DayOfWeek).Select(ToResponse).ToList();
    }

    /// <summary>True khi cả khoảng [startUtc, endUtc) nằm trong giờ mở cửa của một ngày địa phương (không bắc qua nửa đêm).</summary>
    public async Task<bool> IsOpenAsync(int roomId, DateTime startUtc, DateTime endUtc, CancellationToken ct = default)
    {
        var start = VietnamTime.ToLocal(startUtc);
        var end = VietnamTime.ToLocal(endUtc);

        if (start.Date != end.Date)
        {
            return false;
        }

        var day = (int)start.DayOfWeek;
        var row = await db.Set<RoomOpeningHour>().AsNoTracking()
            .SingleOrDefaultAsync(h => h.RoomId == roomId && h.DayOfWeek == day, ct);

        return Covers(row, start, end);
    }

    /// <summary>Kiểm tra thuần tính toán, dùng chung cho truy vấn nhiều phòng ở AvailabilityService.</summary>
    public static bool Covers(RoomOpeningHour? row, DateTime startLocal, DateTime endLocal)
        => row is not null
           && startLocal.Date == endLocal.Date
           && TimeOnly.FromDateTime(startLocal) >= row.OpenTimeLocal
           && TimeOnly.FromDateTime(endLocal) <= row.CloseTimeLocal;

    private async Task EnsureRoomAsync(int roomId, CancellationToken ct)
    {
        if (!await db.Set<Room>().AnyAsync(r => r.RoomId == roomId, ct))
        {
            throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");
        }
    }

    private static TimeOnly ParseTime(string value)
        => TimeOnly.TryParseExact(value.Trim(), TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)
            ? t
            : throw new BadRequestException("invalid_time", "Giờ phải có dạng HH:mm.");

    private static OpeningHourResponse ToResponse(RoomOpeningHour h)
        => new(h.DayOfWeek,
            h.OpenTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture),
            h.CloseTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture));

    private static string Describe(IEnumerable<RoomOpeningHour> rows)
        => System.Text.Json.JsonSerializer.Serialize(rows.OrderBy(r => r.DayOfWeek).Select(r =>
            r.DayOfWeek + ":" + r.OpenTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture)
            + "-" + r.CloseTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture)));
}
