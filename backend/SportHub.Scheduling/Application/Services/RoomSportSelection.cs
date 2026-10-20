using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Application.Services;

public sealed partial class RoomService
{
    // Legacy type keys remain for price/history compatibility; Managers only choose a Sport.
    private async Task<int> ResolveSportRoomTypeAsync(int sportId, CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(877459021)", ct);
        var sport = await db.Set<Sport>().SingleOrDefaultAsync(s => s.SportId == sportId && s.IsActive, ct)
            ?? throw new BadRequestException("invalid_sport", "Choose an active sport.");
        var typeId = await db.Set<RoomType>().Where(t => t.IsActive
            && db.Set<SportRoomType>().Any(l => l.RoomTypeId == t.RoomTypeId && l.SportId == sportId)
            && !db.Set<SportRoomType>().Any(l => l.RoomTypeId == t.RoomTypeId && l.SportId != sportId))
            .OrderBy(t => t.RoomTypeId).Select(t => (int?)t.RoomTypeId).FirstOrDefaultAsync(ct);
        if (typeId is int id) return id;
        var name = $"Sport {sport.SportId} facilities";
        if (await db.Set<RoomType>().AnyAsync(t => t.Name == name, ct))
            name += $" {Guid.NewGuid():N}";
        var type = new RoomType { Name = name, IsActive = true };
        db.Set<RoomType>().Add(type);
        await db.SaveChangesAsync(ct);
        db.Set<SportRoomType>().Add(new SportRoomType { RoomTypeId = type.RoomTypeId, SportId = sportId });
        await db.SaveChangesAsync(ct);
        return type.RoomTypeId;
    }
}
