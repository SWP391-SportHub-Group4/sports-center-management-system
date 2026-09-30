using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// Bảng giá thuê sân theo loại sân (và tùy chọn môn) + thứ + khung giờ (BR-127). Không cho hai khung giá đang hoạt động chồng
/// lấn trên cùng loại sân, cùng ngày, cùng phạm vi môn — nếu không sẽ không xác định được giá của một khối giờ.
/// Đổi giá không sửa hóa đơn/lượt thuê đã tạo (snapshot ở lúc đặt).
/// </summary>
public sealed class CourtRateService(ISportHubDbContext db, IAuditWriter audit)
{
    private const string TimeFormat = "HH:mm";
    private static readonly string[] AllDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

    public async Task<IReadOnlyList<CourtRateResponse>> ListAsync(int? roomTypeId, bool includeInactive, CancellationToken ct = default)
    {
        var query = db.Set<CourtRate>().AsNoTracking().Where(r => includeInactive || r.IsActive);

        if (roomTypeId is int id)
        {
            query = query.Where(r => r.RoomTypeId == id);
        }

        var rows = await query.OrderBy(r => r.RoomTypeId).ThenBy(r => r.StartTimeLocal).ToListAsync(ct);
        return rows.Select(ToResponse).ToList();
    }

    public async Task<CourtRateResponse> CreateAsync(SaveCourtRateRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var rate = new CourtRate();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockRoomTypesAsync([request.RoomTypeId], ct);
        await ApplyAsync(rate, request, existingId: null, ct);
        db.Set<CourtRate>().Add(rate);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(actorUserId, "CREATE_COURT_RATE", nameof(CourtRate), rate.RateId.ToString(), NewValue: Describe(rate)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return ToResponse(rate);
    }

    public async Task<CourtRateResponse> UpdateAsync(int rateId, SaveCourtRateRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var reference = await db.Set<CourtRate>().AsNoTracking().SingleOrDefaultAsync(r => r.RateId == rateId, ct)
                   ?? throw new NotFoundException("court_rate_not_found", "Không tìm thấy khung giá.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockRoomTypesAsync([reference.RoomTypeId, request.RoomTypeId], ct);
        var rate = await db.Set<CourtRate>().SingleOrDefaultAsync(r => r.RateId == rateId, ct)
                   ?? throw new NotFoundException("court_rate_not_found", "Không tìm thấy khung giá.");

        var before = Describe(rate);
        await ApplyAsync(rate, request, rateId, ct);

        audit.Write(new AuditEntry(actorUserId, "UPDATE_COURT_RATE", nameof(CourtRate), rateId.ToString(),
            OldValue: before, NewValue: Describe(rate)));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(rate);
    }

    public async Task DeleteAsync(int rateId, Guid actorUserId, CancellationToken ct = default)
    {
        var reference = await db.Set<CourtRate>().AsNoTracking().SingleOrDefaultAsync(r => r.RateId == rateId, ct)
                   ?? throw new NotFoundException("court_rate_not_found", "Không tìm thấy khung giá.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockRoomTypesAsync([reference.RoomTypeId], ct);
        var rate = await db.Set<CourtRate>().SingleOrDefaultAsync(r => r.RateId == rateId, ct)
                   ?? throw new NotFoundException("court_rate_not_found", "Không tìm thấy khung giá.");

        // Giá đã được snapshot vào hóa đơn khi đặt nên xóa khung giá không ảnh hưởng lượt thuê cũ.
        db.Set<CourtRate>().Remove(rate);
        audit.Write(new AuditEntry(actorUserId, "DELETE_COURT_RATE", nameof(CourtRate), rateId.ToString(), OldValue: Describe(rate)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task LockRoomTypesAsync(IEnumerable<int> roomTypeIds, CancellationToken ct)
    {
        // The pricing table is small. One transaction-scoped mutex closes create/update overlap races,
        // including a concurrent update that moves a rate between room types.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(877459021)", ct);
        foreach (var id in roomTypeIds.Distinct().Order())
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT room_type_id FROM room_types WHERE room_type_id = {id} FOR UPDATE", ct);
    }

    private async Task ApplyAsync(CourtRate rate, SaveCourtRateRequest request, int? existingId, CancellationToken ct)
    {
        var days = ParseDays(request.DaysOfWeek);
        var start = ParseTime(request.StartTimeLocal);
        var end = ParseTime(request.EndTimeLocal);

        if (end <= start)
        {
            throw new BadRequestException("invalid_rate_window", "Giờ kết thúc phải sau giờ bắt đầu.");
        }

        if (request.PricePerHour <= 0 || request.PricePerHour % 1000 != 0)
        {
            throw new BadRequestException("invalid_price", "Giá mỗi giờ phải dương và là bội số của 1.000 VND (BR-113).");
        }

        if (!await db.Set<RoomType>().AnyAsync(t => t.RoomTypeId == request.RoomTypeId, ct))
        {
            throw new BadRequestException("invalid_room_type", "Loại phòng không tồn tại.");
        }

        if (request.SportId is int sportId)
        {
            var linked = await db.Set<SportRoomType>().AnyAsync(l => l.RoomTypeId == request.RoomTypeId && l.SportId == sportId, ct);
            if (!linked)
            {
                throw new BadRequestException("sport_not_compatible", "Môn này không chơi được ở loại phòng đã chọn (BR-108).");
            }
        }

        if (request.IsActive)
        {
            var others = await db.Set<CourtRate>().AsNoTracking()
                .Where(r => r.IsActive && r.RoomTypeId == request.RoomTypeId && (existingId == null || r.RateId != existingId))
                .ToListAsync(ct);

            var clash = others.FirstOrDefault(o =>
                (o.SportId == null || request.SportId == null || o.SportId == request.SportId)
                && o.StartTimeLocal < end && o.EndTimeLocal > start
                && o.DaysOfWeek.Split(',').Intersect(days).Any());

            if (clash is not null)
            {
                throw new ConflictException(
                    "court_rate_overlap",
                    "Khung giá chồng lấn với khung giá #" + clash.RateId + " (cùng loại sân, ngày và môn).");
            }
        }

        rate.RoomTypeId = request.RoomTypeId;
        rate.SportId = request.SportId;
        rate.DaysOfWeek = string.Join(",", days);
        rate.StartTimeLocal = start;
        rate.EndTimeLocal = end;
        rate.PricePerHour = request.PricePerHour;
        rate.IsActive = request.IsActive;
    }

    private static List<string> ParseDays(IEnumerable<string> input)
    {
        var days = input.Select(d => d.Trim().ToUpperInvariant()).Distinct().ToList();

        if (days.Count == 0 || days.Any(d => !AllDays.Contains(d)))
        {
            throw new BadRequestException("invalid_days", "Thứ phải thuộc MON, TUE, WED, THU, FRI, SAT, SUN.");
        }

        return days.OrderBy(d => Array.IndexOf(AllDays, d)).ToList();
    }

    private static TimeOnly ParseTime(string value)
        => TimeOnly.TryParseExact(value.Trim(), TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)
            ? t
            : throw new BadRequestException("invalid_time", "Giờ phải có dạng HH:mm.");

    private static string Describe(CourtRate r)
        => "{\"roomTypeId\":" + r.RoomTypeId + ",\"sportId\":" + (r.SportId?.ToString() ?? "null")
           + ",\"days\":\"" + r.DaysOfWeek + "\",\"price\":" + r.PricePerHour.ToString(CultureInfo.InvariantCulture)
           + ",\"active\":" + r.IsActive.ToString().ToLowerInvariant() + "}";

    private static CourtRateResponse ToResponse(CourtRate r)
        => new(r.RateId, r.RoomTypeId, r.SportId, r.DaysOfWeek,
            r.StartTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture),
            r.EndTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture),
            r.PricePerHour, r.IsActive);
}
