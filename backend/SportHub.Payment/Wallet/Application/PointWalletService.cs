using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Application;

/// <summary>All writes participate in the caller's transaction; none commits it.</summary>
public sealed class PointWalletService(ISportHubDbContext db, IUserAccessReader users, IClock clock) : IPointWalletService
{
    public const int VndPerPoint = 1000;

    public async Task EnsureWalletAsync(Guid ownerUserId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var owner = await users.GetAsync(ownerUserId, cancellationToken);
        if (owner is null || owner.Role is not ("Member" or "ExternalCoach"))
            throw new BadRequestException("wallet_owner_invalid", "Ví chỉ thuộc Member hoặc ExternalCoach.");

        // ON CONFLICT serializes concurrent first use without aborting the caller's transaction.
        var walletId = Guid.NewGuid();
        var now = clock.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO point_wallets (wallet_id, owner_user_id, available_points, held_points, created_at_utc)
            VALUES ({walletId}, {ownerUserId}, 0, 0, {now})
            ON CONFLICT (owner_user_id) DO NOTHING
            """, cancellationToken);
    }

    public Task<WalletResult> HoldAsync(WalletOperation operation, CancellationToken cancellationToken = default)
        => ApplyAsync(operation, PointEntryType.Hold, -operation.Points, operation.Points, cancellationToken);
    public Task<WalletResult> ReleaseAsync(WalletOperation operation, CancellationToken cancellationToken = default)
        => ApplyAsync(operation, PointEntryType.Release, operation.Points, -operation.Points, cancellationToken);
    public Task<WalletResult> SpendAsync(WalletOperation operation, CancellationToken cancellationToken = default)
        => ApplyAsync(operation, PointEntryType.Spend, 0, -operation.Points, cancellationToken);
    public Task<WalletResult> EarnAsync(WalletOperation operation, CancellationToken cancellationToken = default)
        => ApplyAsync(operation, PointEntryType.Earn, operation.Points, 0, cancellationToken);

    public Task<WalletResult> AdjustAsync(WalletAdjustment adjustment, CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(adjustment.Direction) || string.IsNullOrWhiteSpace(adjustment.Reason))
            throw new BadRequestException("invalid_point_adjustment", "Điều chỉnh cần hướng Credit/Debit và lý do.");
        return ApplyAsync(new WalletOperation(adjustment.OwnerUserId, adjustment.Points, adjustment.ReferenceType,
                adjustment.ReferenceId, adjustment.ActorUserId, adjustment.Reason.Trim()), PointEntryType.Adjustment,
            adjustment.Direction == WalletAdjustmentDirection.Credit ? adjustment.Points : -adjustment.Points, 0, cancellationToken);
    }

    private async Task<WalletResult> ApplyAsync(WalletOperation op, PointEntryType type, int availableDelta, int heldDelta, CancellationToken ct)
    {
        RequireTransaction();
        if (op.Points <= 0 || op.ReferenceId == Guid.Empty || string.IsNullOrWhiteSpace(op.ReferenceType)
            || op.ReferenceType.Length > 80 || op.Note?.Length > 1000 || op.InvoiceItemId == Guid.Empty)
            throw new BadRequestException("invalid_wallet_operation", "Số điểm, tham chiếu hoặc ghi chú không hợp lệ.");

        await EnsureWalletAsync(op.OwnerUserId, ct);
        // Read a fresh snapshot after acquiring the row lock, even when this context has used the wallet before.
        var wallet = await db.Set<PointWallet>().FromSqlInterpolated($"""
            SELECT * FROM point_wallets WHERE owner_user_id = {op.OwnerUserId} FOR UPDATE
            """).AsNoTracking().SingleAsync(ct);

        var prior = await db.Set<PointLedgerEntry>().AsNoTracking().SingleOrDefaultAsync(x =>
            x.WalletId == wallet.WalletId && x.ReferenceType == op.ReferenceType && x.ReferenceId == op.ReferenceId
            && x.EntryType == type && x.InvoiceItemId == op.InvoiceItemId, ct);
        if (prior is not null)
        {
            if (prior.Points != op.Points || prior.AvailableDelta != availableDelta || prior.HeldDelta != heldDelta
                || prior.ActorUserId != op.ActorUserId || prior.Note != op.Note || prior.InvoiceItemId != op.InvoiceItemId)
                throw new WalletReferenceConflictException(op.ReferenceType, op.ReferenceId);
            return new WalletResult(true, prior.AvailableAfter, prior.HeldAfter, prior.LedgerEntryId);
        }

        // Spend/Release must close THIS hold, never draw from another checkout's held balance.
        if (type is PointEntryType.Spend or PointEntryType.Release)
        {
            var entries = await db.Set<PointLedgerEntry>().AsNoTracking().Where(x => x.WalletId == wallet.WalletId
                && x.ReferenceType == op.ReferenceType && x.ReferenceId == op.ReferenceId).ToListAsync(ct);
            var hold = entries.SingleOrDefault(x => x.EntryType == PointEntryType.Hold);
            if (hold is null || hold.Points != op.Points || entries.Any(x => x.EntryType is PointEntryType.Spend or PointEntryType.Release))
                throw new ConflictException("wallet_hold_mismatch", "Giữ điểm không tồn tại, sai số điểm hoặc đã đóng.");
        }
        if (wallet.AvailablePoints + (long)availableDelta < 0)
            throw new InsufficientPointsException(op.Points, wallet.AvailablePoints);
        if (wallet.HeldPoints + (long)heldDelta < 0)
            throw new ConflictException("wallet_hold_mismatch", "Không đủ điểm đang giữ cho giao dịch.");
        if (wallet.AvailablePoints + (long)availableDelta > int.MaxValue || wallet.HeldPoints + (long)heldDelta > int.MaxValue)
            throw new ConflictException("wallet_balance_limit", "Số dư điểm vượt giới hạn lưu trữ.");

        wallet.AvailablePoints += availableDelta;
        wallet.HeldPoints += heldDelta;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE point_wallets SET available_points = {wallet.AvailablePoints}, held_points = {wallet.HeldPoints}
            WHERE wallet_id = {wallet.WalletId}
            """, ct);
        var entry = new PointLedgerEntry
        {
            LedgerEntryId = Guid.NewGuid(), WalletId = wallet.WalletId, EntryType = type, Points = op.Points,
            AvailableDelta = availableDelta, HeldDelta = heldDelta, AvailableAfter = wallet.AvailablePoints,
            HeldAfter = wallet.HeldPoints, ReferenceType = op.ReferenceType, ReferenceId = op.ReferenceId,
            ActorUserId = op.ActorUserId, Note = op.Note, InvoiceItemId = op.InvoiceItemId, CreatedAtUtc = clock.UtcNow
        };
        db.Set<PointLedgerEntry>().Add(entry);
        await db.SaveChangesAsync(ct);
        return new WalletResult(false, entry.AvailableAfter, entry.HeldAfter, entry.LedgerEntryId);
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Wallet writes require the caller's transaction.");
    }
}
