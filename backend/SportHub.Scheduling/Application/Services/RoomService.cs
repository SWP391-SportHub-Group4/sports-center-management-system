using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Danh mục phòng tập — BR-39 (chỉ Center Manager cấu hình), BR-57 (Name unique toàn trung tâm), BR-108 (loại phòng).
/// Phòng ngừng hoạt động (IsActive=false) chặn booking mới nhưng giữ nguyên lịch đã có.
/// </summary>
public sealed partial class RoomService(ISportHubDbContext db, IAuditWriter audit,
    SportHub.BuildingBlocks.Abstractions.Configuration.ISystemSettingProvider settings, IClock clock) : IRoomService
{
    public async Task<RoomResponse> SetRentalAccessAsync(int roomId, bool allowRental, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var room = await db.Set<Room>().FromSqlInterpolated($"SELECT * FROM rooms WHERE room_id = {roomId} FOR UPDATE")
            .SingleOrDefaultAsync(r => r.DeletedAtUtc == null, ct) ?? throw new NotFoundException("room_not_found", "Room not found.");
        var before = Describe(room);
        if (allowRental) room.RentalBookingOpensAtUtc = null;
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
            .Where(r => r.DeletedAtUtc == null)
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
        if (await db.Set<Room>().AnyAsync(r => r.Name == name && r.DeletedAtUtc == null, ct))
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
            AllowRental = request.AllowRental ?? false
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        room.RoomTypeId ??= await ResolveSharedRoomTypeAsync(ct);
        db.Set<Room>().Add(room);
        await db.SaveChangesAsync(ct);
        foreach (var hour in openingHours) hour.RoomId = room.RoomId;
        db.Set<RoomOpeningHour>().AddRange(openingHours);
        var rentalRates = AddCreationRentalRates(room, request, openingHours);
        if (room.AllowRental && request.RentalSetup?.SportId is int rentalSportId)
            await RentalSportOffering.EnableAsync(db, audit, rentalSportId, actorUserId, ct);
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
                        roomId = room.RoomId, roomName = room.Name, roomTypeId = room.RoomTypeId, sportId = rate.SportId,
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
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var room = await db.Set<Room>().FromSqlInterpolated($"SELECT * FROM rooms WHERE room_id = {roomId} FOR UPDATE")
            .SingleOrDefaultAsync(r => r.DeletedAtUtc == null, ct)
            ?? throw new NotFoundException("room_not_found", "Room not found.");

        var name = request.Name.Trim();

        if (name.Length == 0) throw new BadRequestException("invalid_room_name", "Enter a room name.");

        if (await db.Set<Room>().AnyAsync(r => r.Name == name && r.RoomId != roomId && r.DeletedAtUtc == null, ct))
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
            if (allowRental) room.RentalBookingOpensAtUtc = null;
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
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        // Reservations share-lock this row. A reservation either commits before
        // these checks, or sees DeletedAtUtc after deletion and is rejected.
        var room = await db.Set<Room>().FromSqlInterpolated($"SELECT * FROM rooms WHERE room_id = {roomId} FOR UPDATE")
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("room_not_found", "Room not found.");
        if (room.DeletedAtUtc is not null) return;

        var now = clock.UtcNow;
        var referenced = await db.Set<Class>().AnyAsync(c => c.DefaultRoomId == roomId
                             && (c.Status == ClassStatus.Draft || c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress), ct)
                         || await db.Set<ClassSession>().AnyAsync(s => s.RoomId == roomId
                             && s.Status == ClassSessionStatus.Scheduled && s.EndAtUtc > now, ct)
                         || await db.Set<RoomOccupancy>().AnyAsync(o => o.RoomId == roomId && o.IsActive && o.EndAtUtc > now, ct)
                         || await db.Set<RoomBlock>().AnyAsync(b => b.RoomId == roomId && b.EndAtUtc > now, ct)
                         || await db.Set<CourtRental>().AnyAsync(r => r.RoomId == roomId && r.EndAtUtc > now
                             && (r.Status == CourtRentalStatus.PendingPayment || r.Status == CourtRentalStatus.Confirmed || r.Status == CourtRentalStatus.InUse), ct)
                         || await db.Set<IncidentNotice>().AnyAsync(i => i.RoomId == roomId && i.CancelledAtUtc == null && i.EndAtUtc > now, ct)
                         || await db.Set<IncidentFence>().AnyAsync(f => f.Status == IncidentFenceStatus.Open
                             && f.ExpiresAtUtc > now && f.EndAtUtc > now && (f.RoomId == roomId || f.Scope == IncidentScope.Center), ct);

        if (referenced)
        {
            throw new ConflictException(
                "room_in_use",
                "This room still has an active class, an ongoing or upcoming booking, a block, or an incident. Resolve these before deleting it.");
        }

        var before = Describe(room);
        room.DeletedAtUtc = now;
        room.IsActive = false;
        room.AllowRental = false;

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: before, NewValue: Describe(room)));

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
        => System.Text.Json.JsonSerializer.Serialize(new { name = room.Name, capacity = room.Capacity, roomTypeId = room.RoomTypeId, sportId = room.SportId, isActive = room.IsActive, allowRental = room.AllowRental, deletedAtUtc = room.DeletedAtUtc });

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
               .Where(r => r.RoomId == roomId && r.DeletedAtUtc == null)
               .Select(r => new RoomResponse(
                   r.RoomId, r.Name, r.Capacity, db.Set<Class>().Count(c => c.DefaultRoomId == r.RoomId && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)),
                   r.RoomTypeId, r.IsActive, r.SportId, r.RentalBookingOpensAtUtc, r.AllowRental))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("room_not_found", "Room not found.");
}
