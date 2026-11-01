using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Application;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.API.Services;

public sealed class IncidentPointGiftService(ISportHubDbContext db, IPointWalletService wallets,
    PointGiftLimitService limits, INotificationWriter notifications, IAuditWriter audit, IClock clock)
    : IIncidentPointGiftService
{
    public async Task<int> GetMaxPointsAsync(CancellationToken ct = default) => (await limits.GetAsync(ct)).MaxPoints;

    public async Task ApplyAsync(Guid incidentId, Guid managerId, string reason,
        IReadOnlyList<IncidentPointGift> gifts, CancellationToken ct = default)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Incident gifts require a transaction.");
        if (gifts.Count == 0) return;
        var max = await GetMaxPointsAsync(ct);
        if (gifts.Any(g => g.Points <= 0 || g.Points > max))
            throw new BadRequestException("point_gift_limit_exceeded", $"Enter positive whole points up to {max} per member.");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"point-gift-incident:{incidentId}"}, 0))", ct);
        var ids = gifts.Select(g => g.MemberId).ToArray();
        if (await db.Set<PointGift>().AnyAsync(g => g.IncidentId == incidentId && ids.Contains(g.MemberId), ct))
            throw new ConflictException("incident_member_already_gifted", "A member has already received points for this incident.");
        var recipients = await db.Set<UserAccount>().Where(u => ids.Contains(u.UserId)
            && u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Member).ToDictionaryAsync(u => u.UserId, ct);
        if (recipients.Count != ids.Length)
            throw new ConflictException("point_gift_recipient_ineligible", "Refresh the affected members before confirming.");
        foreach (var gift in gifts.OrderBy(g => g.MemberId))
        {
            var id = Guid.NewGuid();
            var result = await wallets.EarnAsync(new WalletOperation(gift.MemberId, gift.Points, "ManagerGift", id, managerId, reason), ct);
            db.Set<PointGift>().Add(new PointGift { GiftId = id, BatchId = incidentId, IncidentId = incidentId,
                MemberId = gift.MemberId, ManagerId = managerId, Points = gift.Points, Reason = reason,
                LedgerEntryId = result.LedgerEntryId, CreatedAtUtc = clock.UtcNow });
            audit.Write(new AuditEntry(managerId, "GIFT_POINTS", nameof(PointGift), id.ToString(),
                NewValue: JsonSerializer.Serialize(new { gift.MemberId, gift.Points, IncidentId = incidentId, result.LedgerEntryId }), Reason: reason));
            var text = $"The Manager gifted you {gift.Points:N0} points for a Gym incident. Reason: {reason}";
            notifications.Queue(new NotificationRequest(gift.MemberId, NotificationEvents.ManagerPointsGifted, text, id));
            notifications.QueueEmail(new EmailNotificationRequest(gift.MemberId, recipients[gift.MemberId].Email,
                NotificationEvents.ManagerPointsGifted, id, "SportHub - Points gift", "<p>" + WebUtility.HtmlEncode(text) + "</p>"));
        }
        await db.SaveChangesAsync(ct);
    }
}
