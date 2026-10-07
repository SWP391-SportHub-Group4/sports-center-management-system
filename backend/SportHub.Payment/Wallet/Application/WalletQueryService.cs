using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Application;

public sealed class WalletQueryService(ISportHubDbContext db, IUserAccessReader users, IAuditWriter audit)
{
    public async Task<WalletBalanceResponse> BalanceAsync(Guid ownerId, Guid? staffActorId, CancellationToken ct, bool manager = false)
    {
        await ValidateOwnerAsync(ownerId, staffActorId, ct, manager);
        var wallet = await db.Set<PointWallet>().AsNoTracking().SingleOrDefaultAsync(x => x.OwnerUserId == ownerId, ct);
        return new(ownerId, wallet?.AvailablePoints ?? 0, wallet?.HeldPoints ?? 0, PointWalletService.VndPerPoint);
    }

    public async Task<IReadOnlyList<WalletLedgerResponse>> LedgerAsync(Guid ownerId, Guid? staffActorId, int page, int pageSize, CancellationToken ct, string? entryType = null, bool manager = false)
    {
        await ValidateOwnerAsync(ownerId, staffActorId, ct, manager);
        page = Math.Clamp(page, 1, 100000);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from entry in db.Set<PointLedgerEntry>().AsNoTracking()
                    join wallet in db.Set<PointWallet>() on entry.WalletId equals wallet.WalletId
                    where wallet.OwnerUserId == ownerId
                    select entry;
        if (!string.IsNullOrWhiteSpace(entryType))
        {
            if (!Enum.TryParse<PointEntryType>(entryType, true, out var filter) || !Enum.IsDefined(filter))
                throw new BadRequestException("invalid_ledger_filter", "Loại giao dịch điểm không hợp lệ.");
            query = query.Where(x => x.EntryType == filter);
        }
        var rows = await query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.LedgerEntryId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return rows.Select(x => new WalletLedgerResponse(x.LedgerEntryId, x.EntryType.ToString().ToUpperInvariant(), x.Points,
            x.AvailableDelta, x.HeldDelta, x.AvailableAfter, x.HeldAfter, x.ReferenceType, x.ReferenceId, x.Note, x.CreatedAtUtc)).ToList();
    }

    private async Task ValidateOwnerAsync(Guid ownerId, Guid? staffActorId, CancellationToken ct, bool manager)
    {
        var owner = await users.GetAsync(ownerId, ct);
        if (owner is null || owner.Role != "Member")
            throw new NotFoundException("wallet_owner_not_found", "Không tìm thấy chủ ví hợp lệ.");
        // Manager wallet views are read-only: audit the committed adjustment instead.
        // Shared /members/{id}/points routes also skip audits for Manager actors.
        // Receptionist retains the access audit required by the counter workflow.
        if (staffActorId is Guid actor && !manager
            && (await users.GetAsync(actor, ct))?.Role == "Receptionist")
        {
            audit.Write(new AuditEntry(actor, "VIEW_MEMBER_WALLET", nameof(PointWallet), ownerId.ToString()));
            await db.SaveChangesAsync(ct);
        }
    }
}
