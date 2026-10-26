using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Payment.Wallet.Application;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.API.Controllers;

public sealed record GiftRecipient(Guid MemberId, [Range(1, int.MaxValue)] int Points, bool MemberAgreed = false);
public sealed class SendPointGifts
{
    public Guid BatchId { get; set; }
    public Guid? IncidentId { get; set; }
    [Required, MinLength(3), MaxLength(1000)] public string Reason { get; set; } = "";
    [Required, MinLength(1), MaxLength(100)] public List<GiftRecipient> Recipients { get; set; } = [];
}

/// <summary>Gifts are applied immediately when the Manager confirms the reviewed selection.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/point-gifts")]
public sealed class PointGiftsController(ISportHubDbContext db, IPointWalletService wallets,
    INotificationWriter notifications, IAuditWriter audit, IClock clock, PointGiftLimitService giftLimits) : ControllerBase
{
    [HttpGet("limits")]
    public async Task<IActionResult> Limits(CancellationToken ct) => Ok(await giftLimits.GetAsync(ct));

    [HttpGet("filters")]
    public async Task<IActionResult> Filters(CancellationToken ct)
        => Ok(await db.Set<MembershipPackage>().AsNoTracking().OrderBy(p => p.Name)
            .Select(p => new { p.PackageId, p.Name }).ToListAsync(ct));

    [HttpGet("recipients")]
    public async Task<IActionResult> Recipients([FromQuery] Guid? incidentId, [FromQuery] string? keyword,
        [FromQuery] int? packageId, [FromQuery] MemberPackageStatus? membershipStatus,
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if (fromDate > toDate) throw new BadRequestException("gift_dates_invalid", "End date must follow start date.");
        var incident = await IncidentAsync(incidentId, ct);
        var query = EligibleMembers(incident);
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(u => u.Email.ToLower().Contains(term)
                || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term)));
        }
        if (packageId.HasValue || membershipStatus.HasValue || fromDate.HasValue || toDate.HasValue)
            query = query.Where(u => db.Set<MemberPackage>().Any(p => p.MemberId == u.UserId
                && (!packageId.HasValue || p.PackageId == packageId)
                && (!membershipStatus.HasValue || p.Status == membershipStatus)
                && (!fromDate.HasValue || p.EndDate >= fromDate)
                && (!toDate.HasValue || p.StartDate <= toDate)));
        page = Math.Clamp(page, 1, 100000); pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(u => u.Profile != null ? u.Profile.FullName : u.Email).ThenBy(u => u.UserId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new { u.UserId, Name = u.Profile != null ? u.Profile.FullName : u.Email, u.Email }).ToListAsync(ct);
        var dayPassIds = DayPassMembers(incident);
        var gifted = incidentId is null ? [] : await db.Set<PointGift>().AsNoTracking()
            .Where(g => g.IncidentId == incidentId).Select(g => g.MemberId).ToListAsync(ct);
        return Ok(new PagedResult<object> { Page = page, PageSize = pageSize, TotalCount = total,
            Items = rows.Select(u => (object)new { memberId = u.UserId, u.Name, u.Email,
                requiresAgreement = dayPassIds.Contains(u.UserId), alreadyGifted = gifted.Contains(u.UserId) }).ToList() });
    }

    [HttpGet]
    public async Task<IActionResult> History([FromQuery] Guid? incidentId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Clamp(page, 1, 100000); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<PointGift>().AsNoTracking().Where(g => incidentId == null || g.IncidentId == incidentId);
        var total = await query.CountAsync(ct);
        var rows = await (from g in query
            join u in db.Set<UserAccount>() on g.MemberId equals u.UserId
            join m in db.Set<UserAccount>() on g.ManagerId equals m.UserId
            orderby g.CreatedAtUtc descending, g.GiftId
            select new { g.GiftId, g.BatchId, g.MemberId, MemberName = u.Profile != null ? u.Profile.FullName : u.Email,
                u.Email, g.Points, g.Reason, g.IncidentId, g.MemberAgreed, g.CreatedAtUtc,
                ManagerName = m.Profile != null ? m.Profile.FullName : m.Email, g.LedgerEntryId })
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Ok(new PagedResult<object> { Items = rows.Cast<object>().ToList(), TotalCount = total, Page = page, PageSize = pageSize });
    }

    [HttpPost]
    public async Task<IActionResult> Send(SendPointGifts body, CancellationToken ct)
    {
        var reason = body.Reason.Trim();
        if (body.BatchId == Guid.Empty || reason.Length is < 3 or > 1000 || body.Recipients.Count is < 1 or > 100
            || body.Recipients.Any(r => r.MemberId == Guid.Empty || r.Points <= 0)
            || body.Recipients.Select(r => r.MemberId).Distinct().Count() != body.Recipients.Count)
            throw new BadRequestException("point_gift_invalid", "Select 1–100 distinct members, positive whole points and a reason.");
        var actor = User.RequireUserId();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"point-gift-batch:{body.BatchId}"}, 0))", ct);
        var existing = await db.Set<PointGift>().AsNoTracking().Where(g => g.BatchId == body.BatchId).ToListAsync(ct);
        if (existing.Count > 0)
        {
            if (existing.Count != body.Recipients.Count || existing.Any(g => g.ManagerId != actor || g.IncidentId != body.IncidentId
                || g.Reason != reason || !body.Recipients.Any(r => r.MemberId == g.MemberId && r.Points == g.Points && r.MemberAgreed == g.MemberAgreed)))
                throw new ConflictException("point_gift_batch_conflict", "This confirmation was used for a different gift. Review a new gift.");
            return Ok(new { body.BatchId, recipients = existing.Count, totalPoints = existing.Sum(g => (long)g.Points) });
        }
        var incident = await IncidentAsync(body.IncidentId, ct);
        var ids = body.Recipients.Select(r => r.MemberId).Order().ToArray();
        if (incident is not null)
        {
            // Serialize all gifts for an incident, even when two managers submit different batches.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock(hashtextextended({$"point-gift-incident:{incident.IncidentId}"}, 0))", ct);
            if (await db.Set<PointGift>().AnyAsync(g => g.IncidentId == incident.IncidentId && ids.Contains(g.MemberId), ct))
                throw new ConflictException("incident_member_already_gifted", "A selected member has already received a gift for this incident. Refresh the recipients.");
        }
        var eligible = await EligibleMembers(incident).Where(u => ids.Contains(u.UserId)).Select(u => u.UserId).ToListAsync(ct);
        if (eligible.Count != ids.Length)
            throw new ConflictException("point_gift_recipient_ineligible", "A selected member is no longer eligible. Refresh and review the recipients.");
        var needsAgreement = DayPassMembers(incident);
        if (body.Recipients.Any(r => needsAgreement.Contains(r.MemberId) && !r.MemberAgreed))
            throw new BadRequestException("day_pass_gift_agreement_required", "Record the day-pass holder's agreement before gifting points.");
        var limit = await giftLimits.GetAsync(ct);
        if (body.Recipients.Any(r => r.Points > limit.MaxPoints))
            throw new BadRequestException("point_gift_limit_exceeded",
                $"Each gift cannot exceed {limit.MaxPoints:N0} points, based on this month's Net collected ({limit.NetCollectedVnd:N0} VND).");
        foreach (var item in body.Recipients.OrderBy(r => r.MemberId))
        {
            var giftId = Guid.NewGuid();
            var result = await wallets.EarnAsync(new WalletOperation(item.MemberId, item.Points, "ManagerGift", giftId, actor, reason), ct);
            var gift = new PointGift { GiftId = giftId, BatchId = body.BatchId, MemberId = item.MemberId, ManagerId = actor,
                IncidentId = body.IncidentId, Points = item.Points, Reason = reason, MemberAgreed = item.MemberAgreed,
                LedgerEntryId = result.LedgerEntryId, CreatedAtUtc = clock.UtcNow };
            db.Set<PointGift>().Add(gift);
            audit.Write(new AuditEntry(actor, "GIFT_POINTS", nameof(PointGift), giftId.ToString(),
                NewValue: JsonSerializer.Serialize(new { item.MemberId, item.Points, body.IncidentId, item.MemberAgreed, result.LedgerEntryId }), Reason: reason));
            var email = await db.Set<UserAccount>().Where(u => u.UserId == item.MemberId).Select(u => u.Email).SingleAsync(ct);
            var text = $"The Manager gifted you {item.Points:N0} points. Reason: {reason}";
            notifications.Queue(new NotificationRequest(item.MemberId, NotificationEvents.ManagerPointsGifted, text, giftId));
            notifications.QueueEmail(new EmailNotificationRequest(item.MemberId, email, NotificationEvents.ManagerPointsGifted, giftId,
                "SportHub - Points gift", "<p>" + WebUtility.HtmlEncode(text) + "</p>"));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new { body.BatchId, recipients = body.Recipients.Count, totalPoints = body.Recipients.Sum(r => (long)r.Points) });
    }

    private async Task<IncidentNotice?> IncidentAsync(Guid? id, CancellationToken ct)
    {
        if (id is null) return null;
        var incident = await db.Set<IncidentNotice>().AsNoTracking().SingleOrDefaultAsync(i => i.IncidentId == id, ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");
        if (!incident.ClosesGym) throw new BadRequestException("gift_incident_not_gym", "Choose a recorded Gym closure incident.");
        return incident;
    }

    private static Guid[] DayPassMembers(IncidentNotice? incident)
        => incident is null ? [] : (JsonSerializer.Deserialize<List<IncidentDayPassMember>>(incident.DayPassMembersJson) ?? [])
            .Select(p => p.MemberId).Distinct().ToArray();

    private IQueryable<UserAccount> EligibleMembers(IncidentNotice? incident)
    {
        var query = db.Set<UserAccount>().AsNoTracking().Where(u => u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Member
            && db.Set<MemberPackage>().Any(p => p.MemberId == u.UserId
                && (p.Status == MemberPackageStatus.Active || p.Status == MemberPackageStatus.Expired
                    || (p.Status == MemberPackageStatus.Cancelled && db.Set<InvoiceItem>().Any(item => item.ItemId == p.InvoiceItemId
                        && db.Set<Invoice>().Any(invoice => invoice.InvoiceId == item.InvoiceId
                            && (invoice.Status == InvoiceStatus.Paid || invoice.Status == InvoiceStatus.PaidAfterReconciliation)))))));
        if (incident is null) return query;
        var from = DateOnly.FromDateTime(VietnamTime.ToLocal(incident.StartAtUtc));
        var to = DateOnly.FromDateTime(VietnamTime.ToLocal(incident.EndAtUtc.AddTicks(-1)));
        var dayPassMembers = DayPassMembers(incident);
        return query.Where(u => dayPassMembers.Contains(u.UserId) || db.Set<MemberPackage>().Any(p => p.MemberId == u.UserId
            && p.PackageId != DayPass.PackageId && p.Status == MemberPackageStatus.Active && p.StartDate <= to && p.EndDate >= from));
    }
}
