using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Services;

public interface IRoomService
{
    Task<IReadOnlyList<RoomResponse>> GetAllAsync(CancellationToken ct = default);

    Task<RoomResponse> CreateAsync(SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<RoomResponse> UpdateAsync(int roomId, SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default);

    Task DeleteAsync(int roomId, Guid actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Danh mục phòng tập — BR-39 (chỉ Center Manager cấu hình), BR-57 (Name unique toàn trung tâm).
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
                r.Classes.Count(c => c.Status == ClassStatus.Active)))
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

        var room = new Room { Name = name, Capacity = request.Capacity };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<Room>().Add(room);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_ROOM", nameof(Room), room.RoomId.ToString(),
            NewValue: $"{{\"name\":\"{name}\",\"capacity\":{room.Capacity}}}"));

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

        var before = $"{{\"name\":\"{room.Name}\",\"capacity\":{room.Capacity}}}";

        room.Name = name;

        // Tăng Capacity ở đây KHÔNG nới trần của các buổi đã tạo: BaselineCapacity của mỗi
        // ClassSession đã chốt lúc tạo (BR-51). Phòng rộng hơn chỉ có tác dụng với buổi sinh sau.
        room.Capacity = request.Capacity;

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: before,
            NewValue: $"{{\"name\":\"{name}\",\"capacity\":{room.Capacity}}}"));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(roomId, ct);
    }

    public async Task DeleteAsync(int roomId, Guid actorUserId, CancellationToken ct = default)
    {
        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");

        // SSOT §5.5: entity thuần cấu hình được xoá cứng CHỈ KHI chưa bị tham chiếu. Kiểm cả
        // Class lẫn ClassSession — buổi học trong quá khứ vẫn cần tên phòng để tra cứu lịch sử.
        var referenced = await db.Set<Class>().AnyAsync(c => c.DefaultRoomId == roomId, ct)
                         || await db.Set<ClassSession>().AnyAsync(s => s.RoomId == roomId, ct);

        if (referenced)
        {
            throw new ConflictException(
                "room_in_use",
                "Phòng tập đang được lớp học hoặc buổi học tham chiếu — không xóa được.");
        }

        db.Set<Room>().Remove(room);

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_ROOM", nameof(Room), roomId.ToString(),
            OldValue: $"{{\"name\":\"{room.Name}\",\"capacity\":{room.Capacity}}}"));

        await db.SaveChangesAsync(ct);
    }

    private async Task<RoomResponse> GetOneAsync(int roomId, CancellationToken ct)
        => await db.Set<Room>()
               .AsNoTracking()
               .Where(r => r.RoomId == roomId)
               .Select(r => new RoomResponse(
                   r.RoomId, r.Name, r.Capacity, r.Classes.Count(c => c.Status == ClassStatus.Active)))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");
}
