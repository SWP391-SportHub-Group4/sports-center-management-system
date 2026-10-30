using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// Khóa phòng theo khung giờ (bảo trì, sự kiện). Khóa chiếm chỗ qua <see cref="IOccupancyService"/> nên chống trùng do DB.
/// Nếu khung giờ đang có lớp/thuê sân thì trả 409 kèm danh sách xung đột — KHÔNG tự hủy hay hoàn tiền; xử lý sự cố có
/// hoàn tiền là quy trình riêng (Incident).
/// </summary>
public sealed class RoomBlockService(ISportHubDbContext db, IOccupancyService occupancy, IAuditWriter audit, IClock clock)
{
    private static readonly TimeSpan MaxListRange = TimeSpan.FromDays(62);

    public async Task<IReadOnlyList<RoomBlockResponse>> ListAsync(
        int? roomId, DateTime? fromUtc, DateTime? toUtc, CancellationToken ct = default)
    {
        var from = fromUtc ?? clock.UtcNow.Date;
        var to = toUtc ?? from.AddDays(31);

        if (to <= from || to - from > MaxListRange)
        {
            throw new BadRequestException("invalid_range", "Invalid range.");
        }

        // Court settings show every upcoming block, including those beyond the calendar's 62-day window.
        // Explicit ranges retain the bounded calendar contract.
        var query = db.Set<RoomBlock>().AsNoTracking();
        query = roomId is not null && fromUtc is null && toUtc is null
            ? query.Where(b => b.EndAtUtc > clock.UtcNow)
            : query.Where(b => b.StartAtUtc < to && b.EndAtUtc > from);

        if (roomId is int id)
        {
            query = query.Where(b => b.RoomId == id);
        }

        return await query
            .OrderBy(b => b.StartAtUtc)
            .Select(b => new RoomBlockResponse(b.BlockId, b.RoomId, b.StartAtUtc, b.EndAtUtc, b.Reason, b.IncidentId, b.CreatedByUserId))
            .ToListAsync(ct);
    }

    public async Task<RoomBlockResponse> CreateAsync(CreateRoomBlockRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.EndAtUtc, DateTimeKind.Utc);

        if (end <= start)
        {
            throw new BadRequestException("invalid_range", "Invalid range.");
        }

        if (end <= clock.UtcNow)
        {
            throw new BadRequestException("block_in_the_past", "Block in the past.");
        }

        if (!await db.Set<Room>().AnyAsync(r => r.RoomId == request.RoomId, ct))
        {
            throw new NotFoundException("room_not_found", "Room not found.");
        }

        var block = new RoomBlock
        {
            BlockId = Guid.NewGuid(),
            RoomId = request.RoomId,
            StartAtUtc = start,
            EndAtUtc = end,
            Reason = request.Reason.Trim(),
            CreatedByUserId = actorUserId
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var result = await occupancy.ReserveAsync(new OccupancyRequest(
            OccupancySources.RoomBlock, block.BlockId, block.RoomId, CoachId: null, start, end), ct);

        if (!result.Succeeded)
        {
            throw new OccupancyConflictException(result.Conflicts);
        }

        db.Set<RoomBlock>().Add(block);

        audit.Write(new AuditEntry(actorUserId, "CREATE_ROOM_BLOCK", nameof(RoomBlock), block.BlockId.ToString(),
            NewValue: await DescribeAsync(block, ct),
            Reason: block.Reason));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return ToResponse(block);
    }

    public async Task<RoomBlockResponse> UpdateAsync(Guid blockId, CreateRoomBlockRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.EndAtUtc, DateTimeKind.Utc);
        if (end <= start) throw new BadRequestException("invalid_range", "The end must be after the start.");
        if (end <= clock.UtcNow) throw new BadRequestException("block_in_the_past", "Block in the past.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var block = await db.Set<RoomBlock>()
            .FromSqlInterpolated($"SELECT * FROM room_blocks WHERE block_id = {blockId} FOR UPDATE")
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("room_block_not_found", "Room block not found.");
        if (block.IncidentId is not null)
            throw new ConflictException("room_block_from_incident", "Manage this block through its incident.");
        if (request.RoomId != block.RoomId)
            throw new BadRequestException("invalid_room", "A block must stay in its original court.");
        var now = clock.UtcNow;
        if (await db.Set<IncidentFence>().AnyAsync(f => f.Status == IncidentFenceStatus.Open && f.ExpiresAtUtc > now
                && (f.Scope == IncidentScope.Center || f.RoomId == block.RoomId)
                && ((f.StartAtUtc < block.EndAtUtc && f.EndAtUtc > block.StartAtUtc)
                    || (f.StartAtUtc < end && f.EndAtUtc > start)), ct))
            throw new ConflictException("room_under_incident_review", "Finish incident review before editing this block.");

        var before = await DescribeAsync(block, ct);
        var result = await occupancy.ReplaceAsync(new OccupancyRequest(
            OccupancySources.RoomBlock, blockId, block.RoomId, CoachId: null, start, end), ct);
        if (!result.Succeeded) throw new OccupancyConflictException(result.Conflicts);

        block.StartAtUtc = start;
        block.EndAtUtc = end;
        block.Reason = request.Reason.Trim();
        audit.Write(new AuditEntry(actorUserId, "UPDATE_ROOM_BLOCK", nameof(RoomBlock), blockId.ToString(),
            OldValue: before, NewValue: await DescribeAsync(block, ct), Reason: block.Reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(block);
    }

    private async Task<string> DescribeAsync(RoomBlock block, CancellationToken ct)
    {
        var name = await db.Set<Room>().Where(r => r.RoomId == block.RoomId).Select(r => r.Name).SingleAsync(ct);
        return System.Text.Json.JsonSerializer.Serialize(new { targetName = name, roomId = block.RoomId, startAtUtc = block.StartAtUtc, endAtUtc = block.EndAtUtc, reason = block.Reason });
    }

    public async Task DeleteAsync(Guid blockId, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var block = await db.Set<RoomBlock>()
                    .FromSqlInterpolated($"SELECT * FROM room_blocks WHERE block_id = {blockId} FOR UPDATE")
                    .SingleOrDefaultAsync(ct)
                    ?? throw new NotFoundException("room_block_not_found", "Room block not found.");

        // Block sinh từ sự cố phải gỡ qua quy trình sự cố (có thông báo/hoàn tiền), không xóa tay ở đây.
        if (block.IncidentId is not null)
        {
            throw new ConflictException("room_block_from_incident", "Room block from incident.");
        }

        await occupancy.ReleaseAsync(OccupancySources.RoomBlock, blockId, ct);
        db.Set<RoomBlock>().Remove(block);
        await RecordFenceStepAsync(block, actorUserId, ct);

        audit.Write(new AuditEntry(actorUserId, "DELETE_ROOM_BLOCK", nameof(RoomBlock), blockId.ToString(),
            OldValue: await DescribeAsync(block, ct)));

        await db.SaveChangesAsync(ct);
        if (tx is not null) await tx.CommitAsync(ct);
    }

    /// <summary>
    /// Removing a block whose window lies inside an incident window the manager is holding is part of handling that incident,
    /// so remember it: abandoning the incident puts the block back. Outside a held window nothing is recorded.
    /// </summary>
    private async Task RecordFenceStepAsync(RoomBlock block, Guid actorUserId, CancellationToken ct)
    {
        var fenceId = await db.Set<IncidentFence>().AsNoTracking()
            .Where(f => f.Status == IncidentFenceStatus.Open && f.StartAtUtc < block.EndAtUtc && f.EndAtUtc > block.StartAtUtc
                        && (f.Scope == IncidentScope.Center || f.RoomId == block.RoomId))
            .OrderBy(f => f.CreatedAtUtc).Select(f => (Guid?)f.FenceId).FirstOrDefaultAsync(ct);
        if (fenceId is null) return;
        db.Set<IncidentFenceStep>().Add(new IncidentFenceStep
        {
            StepId = Guid.NewGuid(), FenceId = fenceId.Value, Kind = IncidentFenceStepKind.RemoveRoomBlock,
            RoomBlockId = block.BlockId, BlockReason = block.Reason, BlockCreatedByUserId = block.CreatedByUserId,
            BeforeStartUtc = block.StartAtUtc, BeforeEndUtc = block.EndAtUtc, BeforeRoomId = block.RoomId,
            AfterStartUtc = block.StartAtUtc, AfterRoomId = block.RoomId,
            ActorUserId = actorUserId, CreatedAtUtc = clock.UtcNow, State = IncidentFenceStepState.Applied
        });
    }

    private static RoomBlockResponse ToResponse(RoomBlock b)
        => new(b.BlockId, b.RoomId, b.StartAtUtc, b.EndAtUtc, b.Reason, b.IncidentId, b.CreatedByUserId);
}
