using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Payment.Wallet.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.AI.Application.Services;

// All private tables are owner-scoped to the authenticated userId.
// No dynamic SQL and no model-selected table access.
internal static class AiMemberExtendedData
{
    public static async Task<object> LoadAsync(ISportHubDbContext db, Guid userId, string question, CancellationToken ct)
    {
        var q = (question ?? string.Empty).ToLowerInvariant();
        var walletRelevant = HasAny(q, "điểm", "ví", "point", "wallet", "ledger", "balance", "giao dịch");
        var packageRelevant = HasAny(q, "gói", "package", "membership", "quyền lợi", "hạn sử dụng");
        var servicesRelevant = HasAny(q, "môn", "thể thao", "dịch vụ", "sport", "service", "gym", "sân", "court", "booking");
        var overview = !(walletRelevant || packageRelevant || servicesRelevant);

        object? myWallet = null;
        object? myLedger = null;
        object? myPackageHistory = null;
        object? enabledSportServices = null;

        if (walletRelevant || overview)
        {
            myWallet = await db.Set<PointWallet>().AsNoTracking()
                .Where(w => w.OwnerUserId == userId)
                .Select(w => new { w.AvailablePoints, w.HeldPoints, w.CreatedAtUtc })
                .SingleOrDefaultAsync(ct);
            // IDs from own wallet only: prevent cross-member ledger access.
            var walletIds = await db.Set<PointWallet>().AsNoTracking()
                .Where(w => w.OwnerUserId == userId).Select(w => w.WalletId).ToArrayAsync(ct);
            myLedger = await db.Set<PointLedgerEntry>().AsNoTracking()
                .Where(e => walletIds.Contains(e.WalletId))
                .OrderByDescending(e => e.CreatedAtUtc).Take(30)
                .Select(e => new { e.EntryType, e.Points, e.AvailableDelta, e.AvailableAfter, e.CreatedAtUtc, e.ReferenceType })
                .ToListAsync(ct);
        }
        if (packageRelevant || overview)
        {
            myPackageHistory = await db.Set<MemberPackage>().AsNoTracking()
                .Where(p => p.MemberId == userId)
                .OrderByDescending(p => p.EndDate).Take(40)
                .Select(p => new { packageName = p.Package != null ? p.Package.Name : "Unknown",
                    status = p.Status.ToString(), p.StartDate, p.EndDate, p.ExpiresAtUtc, p.RemainingSessions })
                .ToListAsync(ct);
        }
        if (servicesRelevant || overview)
        {
            enabledSportServices = await db.Set<SportServiceOffering>().AsNoTracking()
                .Where(s => s.IsEnabled && db.Set<Sport>().Any(p => p.SportId == s.SportId && p.IsActive))
                .OrderBy(s => s.SportId).ThenBy(s => s.ServiceType)
                .Select(s => new { s.SportId, s.ServiceType, s.DefaultSessionMinutes })
                .ToListAsync(ct);
        }
        return new { myWallet, myLedger, myPackageHistory, enabledSportServices,
            limits = "Read-only owner-scoped snapshots. Most history lists capped to 30-40 records; absence cannot prove that no earlier records exist.",
            privacy = "Never include or reveal this member's records to another authenticated user." };
    }

    private static bool HasAny(string question, params string[] words)
        => words.Any(question.Contains);
}
