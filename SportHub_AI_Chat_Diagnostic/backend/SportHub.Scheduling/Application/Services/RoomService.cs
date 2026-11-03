using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Danh mục phòng tập — BR-39 (chỉ Center Manager cấu hình), BR-57 (Name unique toàn trung tâm), BR-108 (loại phòng).
/// Phòng ngừng hoạt động (IsActive=false) chặn booking mới nhưng giữ nguyên lịch đã có.
/// </summary>
public sealed partial class RoomService(ISportHubDbContext db, IAuditWriter audit, IClock clock,
    SportHub.BuildingBlocks.Abstractions.Configuration.ISystemSettingProvider settings) : IRoomService
{
    public async Task<RoomResponse> SetRentalAccessAsync(int roomId, bool allowRental, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var room = await db.Set<Room>().FromSqlInterpolated($"SELECT * FROM rooms WHERE room_id = {roomId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("room_not_found", "Room not found.");
        var before = Describe(room);
        if (allowRental && !room.AllowRental && room.RentalBookingOpensAtUtc is null)
            room.RentalBookingOpensAtUtc = VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(clock).AddDays(1));
        if (allowRental) room.RoomTypeId ??= await ResolveSharedRoomTypeAsync(ct);
        room.AllowRental = allowRental;
        audit.Write(new AuditEntry(actorUserId, allowRental ? "ALLOW_ROOM_RENTAL" : "DISABLE_ROOM_RENTAL",
            nameof(Room), roomId.ToString(), OldValue: before, NewValue: Describe(room)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetOneAsync(roomId, ct);
    }

    public async Task<IReadOnlyList<RoomResponse>> GetAllAsync(CancellationToken ct = default)
        => await db.Set<Room>()
            .AsNoTracking()
            .OrderBy(r => r.Name)
            .Select(r => new RoomResponse(
                r.RoomId,
                r.Name,
                r.Capacity,
                db.Set<Class>().Count(c => c.DefaultRoomId == r.RoomId && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)),
                r.RoomTypeId,
                r.IsActive, r.SportId, r.RentalBookingOpensAtUtc, r.AllowRental))
            .ToListAsync(ct);

    public async Task<RoomResponse> CreateAsync(SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var name = request.Name.Trim();

        // BR-57 kiểm trước để có thông báo rõ ràng; unique index trong DB mới là nơi chặn thật
        // (hai request đồng thời đều đi qua được kiểm tra này).
        if (await db.Set<Room>().AnyAsync(r => r.Name == name, ct))
        {
            throw new ConflictException("room_name_taken", "Room name taken.");
        }

        await EnsureRoomTypeAsync(request.RoomTypeId, ct);
        if (name.Length == 0) throw new BadRequestException("invalid_room_name", "Enter a room name.");
        var openingHours = await CreationOpeningHoursAsync(request, ct);

        var room = new Room
        {
            Name = name,
            Capacity = request.Capacity,
            RoomTypeId = request.RoomTypeId,
            IsActive = request.IsActive ?? true,
            AllowRental = request.AllowRental ?? false,
            RentalBookingOpensAtUtc = request.AllowRental == true
                ? VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(clock).AddDays(1)) : null
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        room.RoomTypeId ??= await ResolveSharedRoomTypeAsync(ct);
        db.Set<Room>().Add(room);
        await db.SaveChangesAsync(ct);
        foreach (var hour in openingHours) hour.RoomId = room.RoomId;
        db.Set<RoomOpeningHour>().AddRange(openingHours);
        var rentalRates = AddCreationRentalRates(room, request, openingHours);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_ROOM", nameof(Room), room.RoomId.ToString(),
            NewValue: Describe(room)));
        if (room.AllowRental)
        {
            audit.Write(new AuditEntry(actorUserId, "SET_ROOM_OPENING_HOURS", nameof(Room), room.RoomId.ToString(),
                NewValue: System.Text.Json.JsonSerializer.Serialize(new { name = room.Name, hours = request.RentalSetup!.Hours })));
            foreach (var rate in rentalRates)
                audit.Write(new AuditEntry(actorUserId, "CREATE_COURT_RATE", nameof(CourtRate), rate.RateId.ToString(),
                    NewValue: System.Text.Json.JsonSerializer.Serialize(new {
                        roomId = room.RoomId, roomName = room.Name, roomTypeId = room.RoomTypeId, sportId = (int?)null,
                        days = rate.DaysOfWeek, startTimeLocal = rate.StartTimeLocal.ToString("HH:mm"),
                        endTimeLocal = rate.EndTimeLocal.ToString("HH:mm"), price = rate.PricePerHour, active = true
                    })));
        }

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOneAsync(room.RoomId, ct);
    }

    public async Task<RoomResponse> UpdateAsync(
        int roomId,
        SaveRoomRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (request.RentalSetup is not null)
            throw new BadRequestException("rental_setup_creation_only", "Use rental pricing and opening hours to update an existing room.");
        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Room not found.");

        var name = request.Name.Trim();

        if (name.Length == 0) throw new BadRequestException("invalid_room_name", "Enter a room name.");

        if (await db.Set<Room>().AnyAsync(r => r.Name == name && r.RoomId != roomId, ct))
        {
            throw new ConflictException("room_name_taken", "Room name taken.");
        }

        if (request.RoomTypeId is not null)
        {
            await EnsureRoomTypeAsync(request.RoomTypeId, ct);
            if (request.RoomTypeId != room.RoomTypeId && await db.Set<CourtRate>().AnyAsync(r => r.RoomId == roomId, ct))
                throw new ConflictException("room_pricing_type_conflict", "Remove this court's rental prices before changing its room type.");
        }

        var before = Describe(room);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        room.Name = name;

        // Tăng Capacity ở đây KHÔNG nới trần của các buổi đã tạo: BaselineCapacity của mỗi
        // ClassSession đã chốt lúc tạo (BR-51). Phòng rộng hơn chỉ có tác dụng với buổi sinh sau.
        room.Capacity = request.Capacity;

        if (request.SportId is null && request.RoomTypeId is not null)
        {
            room.RoomTypeId = request.RoomTypeId;
        }

        if (request.IsActive is bool active)
        {
            room.IsActive = active;
        }

        if (request.AllowRental is bool allowRental)
        {
            if (allowRental && !room.AllowRental && room.RentalBookingOpensAtUtc is null)
                room.RentalBookingOpensAtUtc = VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(clock).AddDays(1));
            room.AllowRental = allowRental;
            if (allowRental) room.RoomTypeId ??= await ResolveSharedRoomTypeAsync(ct);
        }

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: before,
            NewValue: Describe(room)));

        await db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);
        return await GetOneAsync(roomId, ct);
    }

    public async Task DeleteAsync(int roomId, Guid actorUserId, CancellationToken ct = default)
    {
        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Room not found.");

        // SSOT §5.5: entity thuần cấu hình được xoá cứng CHỈ KHI chưa bị tham chiếu. Kiểm cả
        // Class lẫn ClassSession — buổi học trong quá khứ vẫn cần tên phòng để tra cứu lịch sử —
        // và lịch chiếm chỗ/khung khóa. Muốn ngừng dùng thì đặt IsActive=false thay vì xóa.
        var referenced = await db.Set<Class>().AnyAsync(c => c.DefaultRoomId == roomId, ct)
                         || await db.Set<ClassSession>().AnyAsync(s => s.RoomId == roomId, ct)
                         || await db.Set<RoomOccupancy>().AnyAsync(o => o.RoomId == roomId, ct)
                         || await db.Set<RoomBlock>().AnyAsync(b => b.RoomId == roomId, ct);

        if (referenced)
        {
            throw new ConflictException(
                "room_in_use",
                "Room in use.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // Giờ mở cửa là cấu hình của chính phòng nên đi cùng phòng.
        db.Set<RoomOpeningHour>().RemoveRange(db.Set<RoomOpeningHour>().Where(h => h.RoomId == roomId));
        db.Set<Room>().Remove(room);

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: Describe(room)));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    private async Task EnsureRoomTypeAsync(int? roomTypeId, CancellationToken ct)
    {
        if (roomTypeId is int id && !await db.Set<RoomType>().AnyAsync(t => t.RoomTypeId == id, ct))
        {
            throw new BadRequestException("invalid_room_type", "Invalid room type.");
        }
    }

    private static string Describe(Room room)
        => System.Text.Json.JsonSerializer.Serialize(new { name = room.Name, capacity = room.Capacity, roomTypeId = room.RoomTypeId, sportId = room.SportId, isActive = room.IsActive, allowRental = room.AllowRental });

    private async Task<int> ResolveSharedRoomTypeAsync(CancellationToken ct)
    {
        // Internal pricing category, never a sport restriction on a physical room.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(877459021)", ct);
        var type = await db.Set<RoomType>().SingleOrDefaultAsync(t => t.Name == "Multipurpose rooms", ct);
        if (type is null)
        {
            type = new RoomType { Name = "Multipurpose rooms", IsActive = true };
            db.Set<RoomType>().Add(type);
            await db.SaveChangesAsync(ct);
        }
        return type.RoomTypeId;
    }

    private async Task<RoomResponse> GetOneAsync(int roomId, CancellationToken ct)
        => await db.Set<Room>()
               .AsNoTracking()
               .Where(r => r.RoomId == roomId)
               .Select(r => new RoomResponse(
                   r.RoomId, r.Name, r.Capacity, db.Set<Class>().Count(c => c.DefaultRoomId == r.RoomId && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)),
                   r.RoomTypeId, r.IsActive, r.SportId, r.RentalBookingOpensAtUtc, r.AllowRental))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("room_not_found", "Room not found.");
}
