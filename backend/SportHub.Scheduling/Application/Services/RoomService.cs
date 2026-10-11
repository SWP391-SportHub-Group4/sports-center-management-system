using Microsoft.EntityFrameworkCore;
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
public sealed class RoomService(ISportHubDbContext db, IAuditWriter audit) : IRoomService
{
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
                r.IsActive))
            .ToListAsync(ct);

    public async Task<RoomResponse> CreateAsync(SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var name = request.Name.Trim();

        // BR-57 kiểm trước để có thông báo rõ ràng; unique index trong DB mới là nơi chặn thật
        // (hai request đồng thời đều đi qua được kiểm tra này).
        if (await db.Set<Room>().AnyAsync(r => r.Name == name, ct))
        {
            throw new ConflictException("room_name_taken", "Đã có phòng tập trùng tên (BR-57).");
        }

        await EnsureRoomTypeAsync(request.RoomTypeId, ct);

        var room = new Room
        {
            Name = name,
            Capacity = request.Capacity,
            RoomTypeId = request.RoomTypeId,
            IsActive = request.IsActive ?? true
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<Room>().Add(room);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_ROOM", nameof(Room), room.RoomId.ToString(),
            NewValue: Describe(room)));

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
        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");

        var name = request.Name.Trim();

        if (await db.Set<Room>().AnyAsync(r => r.Name == name && r.RoomId != roomId, ct))
        {
            throw new ConflictException("room_name_taken", "Đã có phòng tập trùng tên (BR-57).");
        }

        if (request.RoomTypeId is not null)
        {
            await EnsureRoomTypeAsync(request.RoomTypeId, ct);
        }

        var before = Describe(room);

        room.Name = name;

        // Tăng Capacity ở đây KHÔNG nới trần của các buổi đã tạo: BaselineCapacity của mỗi
        // ClassSession đã chốt lúc tạo (BR-51). Phòng rộng hơn chỉ có tác dụng với buổi sinh sau.
        room.Capacity = request.Capacity;

        if (request.RoomTypeId is not null)
        {
            room.RoomTypeId = request.RoomTypeId;
        }

        if (request.IsActive is bool active)
        {
            room.IsActive = active;
        }

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: before,
            NewValue: Describe(room)));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(roomId, ct);
    }

    public async Task DeleteAsync(int roomId, Guid actorUserId, CancellationToken ct = default)
    {
        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");

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
                "Phòng tập đang được lớp học, buổi học hoặc lịch chiếm chỗ tham chiếu — không xóa được; hãy ngừng hoạt động phòng.");
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
            throw new BadRequestException("invalid_room_type", "Loại phòng không tồn tại.");
        }
    }

    private static string Describe(Room room)
        => System.Text.Json.JsonSerializer.Serialize(new { name = room.Name, capacity = room.Capacity, roomTypeId = room.RoomTypeId, isActive = room.IsActive });

    private async Task<RoomResponse> GetOneAsync(int roomId, CancellationToken ct)
        => await db.Set<Room>()
               .AsNoTracking()
               .Where(r => r.RoomId == roomId)
               .Select(r => new RoomResponse(
                   r.RoomId, r.Name, r.Capacity, db.Set<Class>().Count(c => c.DefaultRoomId == r.RoomId && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)),
                   r.RoomTypeId, r.IsActive))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");
}
