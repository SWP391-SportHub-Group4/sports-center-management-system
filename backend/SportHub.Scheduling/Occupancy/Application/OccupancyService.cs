using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Application;

/// <summary>
/// Bản cài đặt <see cref="IOccupancyService"/>. Chạy trong DbContext và transaction của caller; không tự mở transaction,
/// không commit.
///
/// Chống trùng có hai lớp: (1) truy vấn trước để trả danh sách xung đột đọc được; (2) exclusion constraint trong DB là
/// nơi chặn thật khi hai request đồng thời cùng qua lớp (1). Khi lớp (2) bắn (SQLSTATE 23P01) mà caller đang ở trong transaction,
/// service rollback về savepoint (transaction của caller vẫn dùng được) và trả kết quả thất bại có danh sách xung đột.
///
/// Nhả chỗ = IsActive=false (dòng còn lại làm lịch sử); đặt lại cùng nguồn thì dùng lại dòng đó.
/// </summary>
public sealed class OccupancyService(ISportHubDbContext db) : IOccupancyService
{
    public Task<OccupancyResult> ReserveAsync(OccupancyRequest request, CancellationToken cancellationToken = default)
        => UpsertAsync(request, cancellationToken);

    // Replace và Reserve giống nhau: cùng nguồn thì cập nhật dòng cũ, chưa có thì tạo. Lịch cũ chỉ đổi khi cả hai lớp kiểm đều qua.
    public Task<OccupancyResult> ReplaceAsync(OccupancyRequest request, CancellationToken cancellationToken = default)
        => UpsertAsync(request, cancellationToken);

    public async Task ReleaseAsync(string sourceType, Guid sourceId, CancellationToken cancellationToken = default)
    {
        var type = ParseSource(sourceType);

        var rooms = await db.Set<RoomOccupancy>()
            .Where(o => o.SourceType == type && o.SourceId == sourceId && o.IsActive)
            .ToListAsync(cancellationToken);
        var coaches = await db.Set<CoachOccupancy>()
            .Where(o => o.SourceType == type && o.SourceId == sourceId && o.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var row in rooms) row.IsActive = false;
        foreach (var row in coaches) row.IsActive = false;

        if (rooms.Count + coaches.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<OccupancyResult> UpsertAsync(OccupancyRequest request, CancellationToken ct)
    {
        var type = ParseSource(request.SourceType);
        var start = request.StartUtc.UtcDateTime;
        var end = request.EndUtc.UtcDateTime;

        if (end <= start)
        {
            throw new ArgumentException("Khoảng chiếm chỗ phải có giờ kết thúc sau giờ bắt đầu.", nameof(request));
        }

        if (request.RoomId is null && request.CoachId is null)
        {
            throw new ArgumentException("Phải chiếm ít nhất phòng hoặc coach.", nameof(request));
        }

        var roomRow = await db.Set<RoomOccupancy>()
            .SingleOrDefaultAsync(o => o.SourceType == type && o.SourceId == request.SourceId, ct);
        var coachRow = await db.Set<CoachOccupancy>()
            .SingleOrDefaultAsync(o => o.SourceType == type && o.SourceId == request.SourceId, ct);

        var conflicts = await FindConflictsAsync(request, start, end, roomRow?.OccupancyId, coachRow?.OccupancyId, ct);
        if (conflicts.Count > 0)
        {
            return new OccupancyResult(false, conflicts);
        }

        var touched = new List<object>();

        if (request.RoomId is int roomId)
        {
            if (roomRow is null)
            {
                roomRow = new RoomOccupancy { OccupancyId = Guid.NewGuid(), SourceType = type, SourceId = request.SourceId };
                db.Set<RoomOccupancy>().Add(roomRow);
            }

            roomRow.RoomId = roomId;
            roomRow.StartAtUtc = start;
            roomRow.EndAtUtc = end;
            roomRow.IsActive = true;
            touched.Add(roomRow);
        }
        else if (roomRow is { IsActive: true })
        {
            roomRow.IsActive = false;
            touched.Add(roomRow);
        }

        if (request.CoachId is Guid coachId)
        {
            if (coachRow is null)
            {
                coachRow = new CoachOccupancy { OccupancyId = Guid.NewGuid(), SourceType = type, SourceId = request.SourceId };
                db.Set<CoachOccupancy>().Add(coachRow);
            }

            coachRow.CoachId = coachId;
            coachRow.StartAtUtc = start;
            coachRow.EndAtUtc = end;
            coachRow.IsActive = true;
            touched.Add(coachRow);
        }
        else if (coachRow is { IsActive: true })
        {
            coachRow.IsActive = false;
            touched.Add(coachRow);
        }

        var transaction = db.Database.CurrentTransaction;
        var savepoint = "occupancy_" + Guid.NewGuid().ToString("N");

        if (transaction is not null)
        {
            await transaction.CreateSavepointAsync(savepoint, ct);
        }

        try
        {
            await db.SaveChangesAsync(ct);
            return OccupancyResult.Ok;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
        {
            // Hai request đồng thời cùng qua kiểm tra trước: DB chặn request sau.
            if (transaction is not null)
            {
                await transaction.RollbackToSavepointAsync(savepoint, ct);
            }

            foreach (var entity in touched)
            {
                var entry = db.Entry(entity);
                if (entry.State == EntityState.Added)
                {
                    entry.State = EntityState.Detached;
                }
                else
                {
                    entry.CurrentValues.SetValues(entry.OriginalValues);
                    entry.State = EntityState.Unchanged;
                }
            }

            var after = await FindConflictsAsync(request, start, end, roomRow?.OccupancyId, coachRow?.OccupancyId, ct);
            return new OccupancyResult(false, after);
        }
    }

    private async Task<List<OccupancyConflict>> FindConflictsAsync(
        OccupancyRequest request, DateTime start, DateTime end, Guid? ownRoomRow, Guid? ownCoachRow, CancellationToken ct)
    {
        var conflicts = new List<OccupancyConflict>();

        if (request.RoomId is int roomId)
        {
            var rows = await db.Set<RoomOccupancy>()
                .AsNoTracking()
                .Where(o => o.IsActive && o.RoomId == roomId && o.StartAtUtc < end && o.EndAtUtc > start
                            && o.OccupancyId != ownRoomRow)
                .ToListAsync(ct);

            conflicts.AddRange(rows.Select(o => new OccupancyConflict(
                "Room", o.SourceType.ToString(), o.SourceId,
                DateTime.SpecifyKind(o.StartAtUtc, DateTimeKind.Utc), DateTime.SpecifyKind(o.EndAtUtc, DateTimeKind.Utc))));
        }

        if (request.CoachId is Guid coachId)
        {
            var rows = await db.Set<CoachOccupancy>()
                .AsNoTracking()
                .Where(o => o.IsActive && o.CoachId == coachId && o.StartAtUtc < end && o.EndAtUtc > start
                            && o.OccupancyId != ownCoachRow)
                .ToListAsync(ct);

            conflicts.AddRange(rows.Select(o => new OccupancyConflict(
                "Coach", o.SourceType.ToString(), o.SourceId,
                DateTime.SpecifyKind(o.StartAtUtc, DateTimeKind.Utc), DateTime.SpecifyKind(o.EndAtUtc, DateTimeKind.Utc))));
        }

        return conflicts;
    }

    private static OccupancySourceType ParseSource(string sourceType)
        => Enum.TryParse<OccupancySourceType>(sourceType, ignoreCase: false, out var parsed)
            ? parsed
            : throw new ArgumentOutOfRangeException(nameof(sourceType), sourceType, "Không khớp OccupancySourceType — xem OccupancySources ở BuildingBlocks.");
}
