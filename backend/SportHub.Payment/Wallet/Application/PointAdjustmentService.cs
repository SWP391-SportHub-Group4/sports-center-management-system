using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Application;

public sealed class PointAdjustmentService(ISportHubDbContext db, IPointWalletService wallets, IUserAccessReader users,
    IAuditWriter audit, IClock clock)
{
    public async Task<PointCreditRequestResponse> RequestCreditAsync(Guid ownerId, AdjustPointsRequest request,
        Guid actorId, CancellationToken ct)
    {
        await EnsureManagerAsync(actorId, ct);
        if (request.Direction != WalletAdjustmentDirection.Credit || request.Points <= 0
            || request.IdempotencyKey == Guid.Empty || string.IsNullOrWhiteSpace(request.Reason)
            || request.Reason.Length > 1000)
            throw new BadRequestException("invalid_point_adjustment", "Invalid point adjustment.");
        var owner = await users.GetAsync(ownerId, ct);
        if (owner is not { Role: "Member" })
            throw new BadRequestException("wallet_owner_invalid", "Wallet owner invalid.");

        var reason = request.Reason.Trim();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"point-credit:{request.IdempotencyKey:D}"}, 0))", ct);
        var existing = await db.Set<PointCreditRequest>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.RequestId == request.IdempotencyKey, ct);
        if (existing is not null)
        {
            if (existing.OwnerUserId != ownerId || existing.RequestedByUserId != actorId
                || existing.Points != request.Points || existing.Reason != reason)
                throw new ConflictException("point_credit_request_conflict", "Point credit request key was already used.");
            await tx.CommitAsync(ct);
            return Map(existing);
        }

        var entity = new PointCreditRequest
        {
            RequestId = request.IdempotencyKey, OwnerUserId = ownerId, RequestedByUserId = actorId,
            Points = request.Points, Reason = reason, Status = PointCreditRequestStatus.Pending,
            RequestedAtUtc = clock.UtcNow
        };
        db.Set<PointCreditRequest>().Add(entity);
        audit.Write(new AuditEntry(actorId, "REQUEST_POINT_CREDIT", nameof(PointCreditRequest),
            entity.RequestId.ToString(), NewValue: JsonSerializer.Serialize(new { ownerId, request.Points }), Reason: reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(entity);
    }

    // Manual debits do not create points, so they keep the existing immediate path.
    public async Task<WalletResult> AdjustDebitAsync(Guid ownerId, AdjustPointsRequest request,
        Guid actorId, CancellationToken ct)
    {
        await EnsureManagerAsync(actorId, ct);
        if (request.Direction != WalletAdjustmentDirection.Debit)
            throw new BadRequestException("invalid_point_adjustment", "Invalid point adjustment.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await wallets.AdjustAsync(new WalletAdjustment(ownerId, request.Points, request.Direction,
            "ManagerAdjustment", request.IdempotencyKey, actorId, request.Reason), ct);
        if (!result.AlreadyApplied)
        {
            audit.Write(new AuditEntry(actorId, "ADJUST_POINTS", "PointWallet", ownerId.ToString(),
                NewValue: JsonSerializer.Serialize(new { request.Points, request.Direction, result.LedgerEntryId }),
                Reason: request.Reason));
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return result;
    }

    public async Task<PagedResult<PointCreditRequestResponse>> ListAsync(string? status, int page, int pageSize,
        Guid actorId, CancellationToken ct)
    {
        await EnsureManagerAsync(actorId, ct);
        var query = db.Set<PointCreditRequest>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<PointCreditRequestStatus>(status, true, out var parsed) || !Enum.IsDefined(parsed))
                throw new BadRequestException("point_credit_status_invalid", "Point credit status invalid.");
            query = query.Where(x => x.Status == parsed);
        }
        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var totalCount = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.RequestedAtUtc).ThenByDescending(x => x.RequestId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var userIds = items.SelectMany(x => new[] { x.OwnerUserId, x.RequestedByUserId }).Distinct().ToArray();
        var names = await db.Set<UserAccount>().AsNoTracking().Where(x => userIds.Contains(x.UserId))
            .Select(x => new { x.UserId, x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .ToDictionaryAsync(x => x.UserId, ct);
        var responses = items.Select(x =>
        {
            names.TryGetValue(x.OwnerUserId, out var owner);
            names.TryGetValue(x.RequestedByUserId, out var requester);
            return Map(x) with { OwnerName = owner?.Name, OwnerEmail = owner?.Email,
                RequestedByName = requester?.Name };
        }).ToList();
        return new PagedResult<PointCreditRequestResponse>
        {
            Items = responses, Page = page, PageSize = pageSize, TotalCount = totalCount
        };
    }

    public async Task<PointCreditRequestResponse> ApproveAsync(Guid requestId, Guid actorId, CancellationToken ct)
    {
        await EnsureManagerAsync(actorId, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await LockRequestAsync(requestId, ct);
        if (request.RequestedByUserId == actorId)
            throw new ForbiddenException("cannot_approve_own_point_credit", "Cannot approve own point credit.");
        if (request.Status == PointCreditRequestStatus.Approved && request.DecidedByUserId == actorId)
            return Map(request);
        if (request.Status != PointCreditRequestStatus.Pending)
            throw new ConflictException("point_credit_already_resolved", "Point credit request already resolved.");
        var requester = await users.GetAsync(request.RequestedByUserId, ct);
        if (requester is not { Role: "CenterManager", IsActive: true })
            throw new ConflictException("point_credit_requester_inactive", "Requester is no longer an active Manager.");

        var result = await wallets.AdjustAsync(new WalletAdjustment(request.OwnerUserId, request.Points,
            WalletAdjustmentDirection.Credit, "ManagerAdjustment", request.RequestId, actorId, request.Reason), ct);
        request.Status = PointCreditRequestStatus.Approved;
        request.DecidedByUserId = actorId;
        request.DecidedAtUtc = clock.UtcNow;
        request.LedgerEntryId = result.LedgerEntryId;
        audit.Write(new AuditEntry(actorId, "APPROVE_POINT_CREDIT", nameof(PointCreditRequest), requestId.ToString(),
            OldValue: "{\"status\":\"Pending\"}",
            NewValue: JsonSerializer.Serialize(new { status = "Approved", request.LedgerEntryId }),
            Reason: request.Reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(request);
    }

    public async Task<PointCreditRequestResponse> RejectAsync(Guid requestId, string reason, Guid actorId,
        CancellationToken ct)
    {
        await EnsureManagerAsync(actorId, ct);
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("point_credit_rejection_reason_required", "Rejection reason required.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await LockRequestAsync(requestId, ct);
        if (request.RequestedByUserId == actorId)
            throw new ForbiddenException("cannot_resolve_own_point_credit", "Cannot resolve own point credit.");
        if (request.Status != PointCreditRequestStatus.Pending)
            throw new ConflictException("point_credit_already_resolved", "Point credit request already resolved.");
        request.Status = PointCreditRequestStatus.Rejected;
        request.DecidedByUserId = actorId;
        request.DecidedAtUtc = clock.UtcNow;
        request.DecisionReason = reason.Trim();
        audit.Write(new AuditEntry(actorId, "REJECT_POINT_CREDIT", nameof(PointCreditRequest), requestId.ToString(),
            OldValue: "{\"status\":\"Pending\"}", NewValue: "{\"status\":\"Rejected\"}",
            Reason: request.DecisionReason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(request);
    }

    private async Task<PointCreditRequest> LockRequestAsync(Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<PointCreditRequest>().FromSqlInterpolated(
            $"SELECT * FROM point_credit_requests WHERE request_id = {requestId} FOR UPDATE").ToListAsync(ct);
        return rows.SingleOrDefault()
            ?? throw new NotFoundException("point_credit_request_not_found", "Point credit request not found.");
    }

    private async Task EnsureManagerAsync(Guid actorId, CancellationToken ct)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is not { Role: "CenterManager", IsActive: true })
            throw new ForbiddenException("wallet_adjustment_forbidden", "Wallet adjustment forbidden.");
    }

    private static PointCreditRequestResponse Map(PointCreditRequest x) => new(x.RequestId, x.OwnerUserId,
        x.RequestedByUserId, x.Points, x.Reason, x.Status.ToString(), x.RequestedAtUtc,
        x.DecidedByUserId, x.DecidedAtUtc, x.DecisionReason, x.LedgerEntryId);
}
