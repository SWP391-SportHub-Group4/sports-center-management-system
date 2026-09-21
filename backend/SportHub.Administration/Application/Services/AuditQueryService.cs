using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Administration.Application.Services;

public sealed record AuditLogDto(
    Guid AuditId,
    Guid UserId,
    string ActorEmail,
    string Action,
    string TargetEntity,
    string TargetId,
    string? OldValue,
    string? NewValue,
    string IpAddress,
    DateTime Timestamp);

public interface IAuditQueryService
{
    Task<PagedResult<AuditLogDto>> SearchAsync(
        string? action, string? targetEntity, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default);
}

/// <summary>
/// Đọc Audit Log (BR-7 — "Center Manager xem lịch sử thao tác").
/// Chỉ đọc: không có endpoint nào sửa/xoá audit, nếu không nhật ký mất giá trị làm bằng chứng.
/// </summary>
public sealed class AuditQueryService(ISportHubDbContext db) : IAuditQueryService
{
    public async Task<PagedResult<AuditLogDto>> SearchAsync(
        string? action,
        string? targetEntity,
        DateTime? fromUtc,
        DateTime? toUtc,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 25 : pageSize, 1, 200);

        var query = db.Set<AuditLog>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(action))
        {
            query = query.Where(a => a.Action == action);
        }

        if (!string.IsNullOrWhiteSpace(targetEntity))
        {
            query = query.Where(a => a.TargetEntity == targetEntity);
        }

        if (fromUtc is not null)
        {
            query = query.Where(a => a.Timestamp >= fromUtc);
        }

        if (toUtc is not null)
        {
            query = query.Where(a => a.Timestamp < toUtc);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditLogDto(
                a.AuditId,
                a.UserId,
                a.User!.Email,
                a.Action,
                a.TargetEntity,
                a.TargetId,
                a.OldValue,
                a.NewValue,
                a.IpAddress,
                a.Timestamp))
            .ToListAsync(ct);

        return new PagedResult<AuditLogDto>(items, page, pageSize, total);
    }
}
