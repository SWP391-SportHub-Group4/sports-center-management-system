using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// Khóa phòng theo khung giờ (bảo trì, sự kiện). Khóa chiếm chỗ qua <see cref="IOccupancyService"/> nên chống trùng do DB.
/// Nếu khung giờ đang có lớp/PT/thuê sân thì trả 409 kèm danh sách xung đột — KHÔNG tự hủy hay hoàn tiền; xử lý sự cố có
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
            throw new BadRequestException("invalid_range", "Khoảng thời gian phải dương và tối đa 62 ngày.");
        }

        var query = db.Set<RoomBlock>().AsNoTracking().Where(b => b.StartAtUtc < to && b.EndAtUtc > from);

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
            throw new BadRequestException("invalid_range", "Giờ kết thúc phải sau giờ bắt đầu.");
        }

        if (end <= clock.UtcNow)
        {
            throw new BadRequestException("block_in_the_past", "Không thể khóa phòng cho khung giờ đã qua.");
        }

        if (!await db.Set<Room>().AnyAsync(r => r.RoomId == request.RoomId, ct))
        {
            throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");
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

    private async Task<string> DescribeAsync(RoomBlock block, CancellationToken ct)
    {
        var name = await db.Set<Room>().Where(r => r.RoomId == block.RoomId).Select(r => r.Name).SingleAsync(ct);
        return System.Text.Json.JsonSerializer.Serialize(new { targetName = name, roomId = block.RoomId, startAtUtc = block.StartAtUtc, endAtUtc = block.EndAtUtc, reason = block.Reason });
    }

    public async Task DeleteAsync(Guid blockId, Guid actorUserId, CancellationToken ct = default)
    {
        var block = await db.Set<RoomBlock>().SingleOrDefaultAsync(b => b.BlockId == blockId, ct)
                    ?? throw new NotFoundException("room_block_not_found", "Không tìm thấy khung khóa phòng.");

        // Block sinh từ sự cố phải gỡ qua quy trình sự cố (có thông báo/hoàn tiền), không xóa tay ở đây.
        if (block.IncidentId is not null)
        {
            throw new ConflictException("room_block_from_incident", "Khung khóa do sự cố tạo ra — xử lý qua quy trình sự cố.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        await occupancy.ReleaseAsync(OccupancySources.RoomBlock, blockId, ct);
        db.Set<RoomBlock>().Remove(block);

        audit.Write(new AuditEntry(actorUserId, "DELETE_ROOM_BLOCK", nameof(RoomBlock), blockId.ToString(),
            OldValue: await DescribeAsync(block, ct)));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static RoomBlockResponse ToResponse(RoomBlock b)
        => new(b.BlockId, b.RoomId, b.StartAtUtc, b.EndAtUtc, b.Reason, b.IncidentId, b.CreatedByUserId);
}
