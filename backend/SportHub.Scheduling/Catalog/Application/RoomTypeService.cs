using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>Loại phòng/sân và bảng môn nào chơi được ở loại nào (BR-108).</summary>
public sealed class RoomTypeService(ISportHubDbContext db, IAuditWriter audit, ServiceUsageGuard usage)
{
    public async Task<IReadOnlyList<RoomTypeResponse>> ListAsync(CancellationToken ct = default)
    {
        var types = await db.Set<RoomType>().AsNoTracking().OrderBy(t => t.Name).ToListAsync(ct);
        var links = (await db.Set<SportRoomType>().AsNoTracking().ToListAsync(ct))
            .ToLookup(l => l.RoomTypeId, l => l.SportId);

        return types.Select(t => new RoomTypeResponse(t.RoomTypeId, t.Name, links[t.RoomTypeId].OrderBy(x => x).ToList())).ToList();
    }

    public async Task<RoomTypeResponse> CreateAsync(SaveRoomTypeRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var name = request.Name.Trim();

        if (await db.Set<RoomType>().AnyAsync(t => t.Name == name, ct))
        {
            throw new ConflictException("room_type_name_taken", "Đã có loại phòng trùng tên.");
        }

        var type = new RoomType { Name = name };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Set<RoomType>().Add(type);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(actorUserId, "CREATE_ROOM_TYPE", nameof(RoomType), type.RoomTypeId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { name })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new RoomTypeResponse(type.RoomTypeId, type.Name, []);
    }

    public async Task<RoomTypeResponse> RenameAsync(int roomTypeId, SaveRoomTypeRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var type = await FindAsync(roomTypeId, ct);
        var name = request.Name.Trim();

        if (await db.Set<RoomType>().AnyAsync(t => t.Name == name && t.RoomTypeId != roomTypeId, ct))
        {
            throw new ConflictException("room_type_name_taken", "Đã có loại phòng trùng tên.");
        }

        audit.Write(new AuditEntry(actorUserId, "UPDATE_ROOM_TYPE", nameof(RoomType), roomTypeId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { name = type.Name }), NewValue: System.Text.Json.JsonSerializer.Serialize(new { name })));

        type.Name = name;
        await db.SaveChangesAsync(ct);

        return await GetAsync(roomTypeId, ct);
    }

    /// <summary>Thay toàn bộ danh sách môn chơi được ở loại phòng này. Môn phải tồn tại.</summary>
    public async Task<RoomTypeResponse> SetSportsAsync(int roomTypeId, SetRoomTypeSportsRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await FindAsync(roomTypeId, ct);

        var wanted = request.SportIds.Distinct().ToList();
        var known = await db.Set<Sport>().AsNoTracking().Where(s => wanted.Contains(s.SportId)).Select(s => s.SportId).ToListAsync(ct);
        var missing = wanted.Except(known).ToList();

        if (missing.Count > 0)
        {
            throw new BadRequestException("invalid_sport", "Môn không tồn tại: " + string.Join(", ", missing) + ".");
        }

        var current = await db.Set<SportRoomType>().Where(l => l.RoomTypeId == roomTypeId).ToListAsync(ct);
        var unlinked = current.Where(l => !wanted.Contains(l.SportId)).ToList();

        // Gỡ môn khỏi loại phòng làm phòng thuộc loại đó không còn dùng được cho PT của môn: chặn khi còn buổi PT tương lai.
        if (unlinked.Count > 0)
        {
            await usage.RequireNoFuturePtInRoomTypesAsync([roomTypeId], ct);
        }

        db.Set<SportRoomType>().RemoveRange(unlinked);
        db.Set<SportRoomType>().AddRange(wanted
            .Where(id => current.All(l => l.SportId != id))
            .Select(id => new SportRoomType { RoomTypeId = roomTypeId, SportId = id }));

        audit.Write(new AuditEntry(actorUserId, "SET_ROOM_TYPE_SPORTS", nameof(RoomType), roomTypeId.ToString(),
            OldValue: "[" + string.Join(",", current.Select(l => l.SportId).OrderBy(x => x)) + "]",
            NewValue: "[" + string.Join(",", wanted.OrderBy(x => x)) + "]"));

        await db.SaveChangesAsync(ct);
        return await GetAsync(roomTypeId, ct);
    }

    public async Task DeleteAsync(int roomTypeId, Guid actorUserId, CancellationToken ct = default)
    {
        var type = await FindAsync(roomTypeId, ct);

        var referenced = await db.Set<Room>().AnyAsync(r => r.RoomTypeId == roomTypeId, ct)
                         || await db.Set<CourtRate>().AnyAsync(r => r.RoomTypeId == roomTypeId, ct);

        if (referenced)
        {
            throw new ConflictException("room_type_in_use", "Loại phòng đang được phòng hoặc bảng giá sử dụng — không xóa được.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        db.Set<SportRoomType>().RemoveRange(db.Set<SportRoomType>().Where(l => l.RoomTypeId == roomTypeId));
        db.Set<RoomType>().Remove(type);

        audit.Write(new AuditEntry(actorUserId, "DELETE_ROOM_TYPE", nameof(RoomType), roomTypeId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { name = type.Name })));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task<RoomType> FindAsync(int roomTypeId, CancellationToken ct)
        => await db.Set<RoomType>().SingleOrDefaultAsync(t => t.RoomTypeId == roomTypeId, ct)
           ?? throw new NotFoundException("room_type_not_found", "Không tìm thấy loại phòng.");

    private async Task<RoomTypeResponse> GetAsync(int roomTypeId, CancellationToken ct)
    {
        var type = await db.Set<RoomType>().AsNoTracking().SingleAsync(t => t.RoomTypeId == roomTypeId, ct);
        var sportIds = await db.Set<SportRoomType>().AsNoTracking()
            .Where(l => l.RoomTypeId == roomTypeId).Select(l => l.SportId).OrderBy(x => x).ToListAsync(ct);

        return new RoomTypeResponse(type.RoomTypeId, type.Name, sportIds);
    }
}
