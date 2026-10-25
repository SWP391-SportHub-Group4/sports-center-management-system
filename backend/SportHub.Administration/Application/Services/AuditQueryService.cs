using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Administration.Application.Services;

public sealed record AuditLogResponse(
    Guid AuditId,
    Guid UserId,
    string ActorEmail,
    string Action,
    string TargetEntity,
    string TargetId,
    string? OldValue,
    string? NewValue,
    string IpAddress,
    DateTime Timestamp,
    string? TargetFullName = null,
    string? TargetEmail = null,
    bool? TargetAccountExists = null,
    string? CurrentTargetLabel = null,
    IReadOnlyDictionary<string, string>? ReferenceNames = null,
    string? ActorRole = null,
    string? ActorFullName = null);

/// <summary>
/// Đọc Audit Log (BR-7 — "Center Manager xem lịch sử thao tác").
/// Chỉ đọc: không có endpoint nào sửa/xoá audit, nếu không nhật ký mất giá trị làm bằng chứng.
/// </summary>
public sealed class AuditQueryService(ISportHubDbContext db) : IAuditQueryService
{
    private static IQueryable<AuditLog> Visible(IQueryable<AuditLog> query, bool administrator)
        => administrator
            ? query.Where(a => a.ActorRole == "SYSTEM_ADMINISTRATOR" || a.ActorRole == "CENTER_MANAGER"
                || a.ActorRole == "COACH" || a.ActorRole == "SYSTEM"
                || (a.ActorRole == "MEMBER" && (
                    (a.TargetEntity == "UserProfile" && (a.Action == "UPDATE_AVATAR" || a.Action == "DELETE_AVATAR" || a.Action == "IMPORT_GOOGLE_AVATAR"))
                    || (a.TargetEntity == "MemberSupportPayout" && (a.Action == "SUPPORT_PAYOUT_CONFIRMED" || a.Action == "SUPPORT_PAYOUT_NOT_RECEIVED"))
                    || (a.TargetEntity == "MemberSupportRequest" && a.Action == "REMIND_SUPPORT_REQUEST")
                    || (a.TargetEntity == "Invoice" && a.Action == "CONVERT_UNACTIVATED_PAYMENT_TO_POINTS"))))
            : query.Where(a => a.ActorRole == "CENTER_MANAGER" || a.ActorRole == "RECEPTIONIST"
                || a.ActorRole == "COACH" || a.ActorRole == "MEMBER");

    public async Task<IReadOnlyList<string>> ListActionsAsync(bool administrator = false, CancellationToken ct = default)
    {
        var query = Visible(db.Set<AuditLog>().AsNoTracking(), administrator);
        var recorded = await query.Where(a => a.Action.Trim() != "")
            .Select(a => a.Action).Distinct().ToListAsync(ct);
        var actions = administrator ? recorded.Concat(AccountAuditActions.All) : recorded;
        return actions.Where(a => !string.IsNullOrWhiteSpace(a))
            .Distinct(StringComparer.Ordinal).OrderBy(a => a, StringComparer.Ordinal).ToArray();
    }

    public async Task<PagedResult<AuditLogResponse>> SearchAsync(
        string? action,
        string? targetEntity,
        DateTime? fromUtc,
        DateTime? toUtc,
        int page,
        int pageSize,
        CancellationToken ct = default, Guid? actorId = null, bool administrator = false,
        string? sortBy = null, string? sortDirection = null, string? targetId = null, string? actorRole = null,
        string? actor = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 25 : pageSize, 1, 200);

        var query = Visible(db.Set<AuditLog>().AsNoTracking(), administrator);
        if (actorId.HasValue) query = query.Where(a => a.UserId == actorId);
        if (!string.IsNullOrWhiteSpace(actor))
        {
            var term = actor.Trim().ToLowerInvariant();
            query = query.Where(a => a.User != null && (a.User.Email.ToLower().Contains(term)
                || (a.User.Profile != null && a.User.Profile.FullName.ToLower().Contains(term))));
        }
        if (!string.IsNullOrWhiteSpace(actorRole))
        {
            var roles = new[] { "SYSTEM_ADMINISTRATOR", "CENTER_MANAGER", "COACH", "MEMBER", "RECEPTIONIST", "SYSTEM", "UNKNOWN" };
            if (!roles.Contains(actorRole))
                throw new BadRequestException("invalid_actor_role", "Unsupported actor role.");
            query = query.Where(a => a.ActorRole == actorRole);
        }
        if (!string.IsNullOrWhiteSpace(targetId)) query = query.Where(a => a.TargetId == targetId);

        if (!string.IsNullOrWhiteSpace(action))
        {
            query = query.Where(a => a.Action == action);
        }

        if (!string.IsNullOrWhiteSpace(targetEntity))
        {
            var term = targetEntity.Trim().ToLowerInvariant();
            var pattern = "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(a => EF.Functions.Like(a.TargetEntity.ToLower(), pattern, "\\"));
        }

        if (fromUtc is not null)
        {
            query = query.Where(a => a.Timestamp >= fromUtc);
        }

        if (toUtc is not null)
        {
            query = query.Where(a => a.Timestamp < toUtc);
        }

        var column = string.IsNullOrWhiteSpace(sortBy) ? "timestamp" : sortBy;
        var direction = string.IsNullOrWhiteSpace(sortDirection) ? "desc" : sortDirection;
        if (direction is not ("asc" or "desc"))
            throw new BadRequestException("invalid_sort_direction", "Sort direction must be asc or desc.");
        var descending = direction == "desc";
        IOrderedQueryable<AuditLog> ordered = column switch
        {
            "timestamp" => descending ? query.OrderByDescending(a => a.Timestamp) : query.OrderBy(a => a.Timestamp),
            "actorEmail" => descending ? query.OrderByDescending(a => a.User!.Email) : query.OrderBy(a => a.User!.Email),
            "action" => descending ? query.OrderByDescending(a => a.Action) : query.OrderBy(a => a.Action),
            "targetEntity" => descending ? query.OrderByDescending(a => a.TargetEntity) : query.OrderBy(a => a.TargetEntity),
            _ => throw new BadRequestException("invalid_sort_column", "Unsupported audit sort column.")
        };
        var total = await query.CountAsync(ct);

        var items = await ordered
            .ThenBy(a => a.AuditId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditLogResponse(
                a.AuditId,
                a.UserId,
                a.User!.Email,
                a.Action,
                a.TargetEntity,
                a.TargetId,
                a.OldValue,
                a.NewValue,
                a.IpAddress,
                a.Timestamp,
                null,
                null,
                null,
                null,
                null,
                a.ActorRole,
                a.User.Profile != null ? a.User.Profile.FullName : null))
            .ToListAsync(ct);

        // Resolve only account targets on this page in one bounded query. TargetId is
        // also used for integer-keyed entities, so never cast the entire audit table to Guid.
        var accountRows = items.Where(a => a.TargetEntity == nameof(UserAccount)).ToList();
        if (accountRows.Count > 0)
        {
            var accountIds = accountRows
                .Select(a => Guid.TryParse(a.TargetId, out var id) ? (Guid?)id : null)
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToArray();
            var targets = await db.Set<UserAccount>()
                .AsNoTracking()
                .Where(u => accountIds.Contains(u.UserId))
                .Select(u => new
                {
                    u.UserId,
                    u.Email,
                    FullName = u.Profile != null ? u.Profile.FullName : null
                })
                .ToDictionaryAsync(u => u.UserId, ct);

            // These are current identity fields, not a snapshot at the event time.
            // Missing targets remain in the audit; non-account events retain their contract.
            items = items.Select(row =>
            {
                if (row.TargetEntity != nameof(UserAccount)) return row;
                var target = Guid.TryParse(row.TargetId, out var id) ? targets.GetValueOrDefault(id) : null;
                return row with
                {
                    TargetFullName = target?.FullName,
                    TargetEmail = target?.Email,
                    TargetAccountExists = target is not null
                };
            }).ToList();
        }

        items = await AuditDisplayResolver.ResolveAsync(db, items, ct);

        return new PagedResult<AuditLogResponse>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }
}
