using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Payment.Wallet.Application;

public sealed class PointAdjustmentService(ISportHubDbContext db, IPointWalletService wallets, IUserAccessReader users, IAuditWriter audit)
{
    public async Task<WalletResult> AdjustAsync(Guid ownerId, AdjustPointsRequest request, Guid actorId, CancellationToken ct)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is not { Role: "CenterManager", IsActive: true })
            throw new ForbiddenException("wallet_adjustment_forbidden", "Chỉ Manager được điều chỉnh điểm.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await wallets.AdjustAsync(new WalletAdjustment(ownerId, request.Points, request.Direction,
            "ManagerAdjustment", request.IdempotencyKey, actorId, request.Reason), ct);
        if (!result.AlreadyApplied)
        {
            audit.Write(new AuditEntry(actorId, "ADJUST_POINTS", "PointWallet", ownerId.ToString(),
                NewValue: JsonSerializer.Serialize(new { request.Points, request.Direction, result.LedgerEntryId }), Reason: request.Reason));
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return result;
    }
}
