using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Services;

public sealed class MembershipFulfillment(ISportHubDbContext db, IAuditWriter audit,
    INotificationWriter notifications, IClock clock, IGymClosureReader gymClosure,
    ISystemSettingProvider settings) : IMembershipFulfillment
{
    public async Task<MembershipPurchaseQuote> QuoteAsync(int packageId, CancellationToken ct = default)
    {
        var catalog = await db.Set<MembershipPackage>().AsNoTracking().SingleOrDefaultAsync(x => x.PackageId == packageId, ct)
            ?? throw new NotFoundException("membership_package_not_found", "Membership package not found.");
        if (!catalog.IsActive) throw new ConflictException("membership_package_discontinued", "Membership package discontinued.");
        if (packageId == DayPass.PackageId &&
            (catalog.DurationDays != DayPass.DurationDays || catalog.SessionLimit is not null))
            throw new ConflictException("day_pass_invalid", "Gym day pass configuration is invalid.");
        if (catalog.Price <= 0 || catalog.Price % 1000 != 0)
            throw new ConflictException("membership_price_invalid", "Membership price invalid.");
        return new(catalog.PackageId, catalog.Name, catalog.Price, catalog.DurationDays, null);
    }

    public async Task<MembershipPurchaseState> GetAsync(Guid memberPackageId, CancellationToken ct = default)
        => await db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberPackageId == memberPackageId)
            .Select(x => new MembershipPurchaseState(x.PackageId, x.StackingApprovedByUserId, x.StackingApprovalReason))
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("member_package_not_found", "Member package not found.");

    public async Task<Guid> PrepareAsync(Guid memberId, int packageId, Guid actorId, bool allowStacking,
        string? stackingReason, CancellationToken ct = default)
    {
        RequireTransaction();
        var quote = await QuoteAsync(packageId, ct);
        if (packageId == DayPass.PackageId)
        {
            var center = await CenterOperatingHours.ReadAsync(settings, ct);
            if (!DayPassClock.IsOpen(center, clock.UtcNow))
                throw new ConflictException(PaymentSupportErrorCodes.DayPassOutsideHours,
                    $"Gym day passes can be purchased only from {center.Opens} until {center.Closes} Vietnam time.");
        }
        // Gói đang Active không chặn mua: đó là gia hạn sớm (BR-65). Chỉ chặn khi còn một lần mua cùng gói chưa thanh toán.
        if (!allowStacking && await db.Set<MemberPackage>().AnyAsync(x => x.MemberId == memberId
            && x.PackageId == packageId && x.Status == MemberPackageStatus.PendingPayment, ct))
            throw new ConflictException("duplicate_active_package", "Duplicate active package.");
        var id = Guid.NewGuid();
        var today = VietnamTime.TodayLocal(clock);
        // Vé Gym 1 ngày chỉ có giá trị trong ngày mua: không bán khi Gym đang đóng cửa vì sự cố.
        if (packageId == DayPass.PackageId && await gymClosure.IsGymClosedAtAsync(clock.UtcNow, ct))
            throw new ConflictException("gym_closed_today", "The Gym is closed right now, so the day pass cannot be sold.");
        if (packageId == DayPass.PackageId && await db.Set<MemberPackage>().AnyAsync(x =>
            x.MemberId == memberId && x.PackageId == DayPass.PackageId
            && x.Status == MemberPackageStatus.Active && x.StartDate <= today && x.EndDate >= today
            && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > clock.UtcNow), ct))
            throw new ConflictException("day_pass_already_active", "A Gym day pass is already active today.");
        var startDate = packageId == DayPass.PackageId
            ? today
            : MemberPackageRules.RenewalStart(today, await LatestActiveEndAsync(memberId, null, today, ct));
        var (pendingStart, pendingEnd) = MemberPackageRules.ComputePeriod(startDate, quote.DurationDays);
        db.Set<MemberPackage>().Add(new MemberPackage
        {
            MemberPackageId = id, MemberId = memberId, PackageId = packageId,
            DurationDaysSnapshot = quote.DurationDays,
            StartDate = pendingStart, EndDate = pendingEnd,
            RemainingSessions = quote.SessionLimit, Status = MemberPackageStatus.PendingPayment,
            StackingApprovedByUserId = allowStacking ? actorId : null,
            StackingApprovalReason = allowStacking ? stackingReason!.Trim() : null
        });
        return id;
    }

    public async Task AttachItemAsync(Guid memberPackageId, Guid itemId, CancellationToken ct = default)
    {
        RequireTransaction();
        var entity = await db.Set<MemberPackage>().SingleAsync(x => x.MemberPackageId == memberPackageId, ct);
        if (entity.InvoiceItemId is not null && entity.InvoiceItemId != itemId)
            throw new ConflictException("membership_invoice_conflict", "Membership invoice conflict.");
        entity.InvoiceItemId = itemId;
    }

    public async Task ActivateAsync(Guid memberPackageId, Guid invoiceId, Guid actorId, CancellationToken ct = default)
    {
        RequireTransaction();
        var entity = await db.Set<MemberPackage>().SingleAsync(x => x.MemberPackageId == memberPackageId, ct);
        if (entity.Status == MemberPackageStatus.Active) return;
        if (entity.Status != MemberPackageStatus.PendingPayment)
            throw new ConflictException("membership_inactive", "Membership inactive.");
        var catalog = await db.Set<MembershipPackage>().SingleAsync(x => x.PackageId == entity.PackageId, ct);
        var today = VietnamTime.TodayLocal(clock);
        var purchaseDay = entity.StartDate;
        var startDate = entity.PackageId == DayPass.PackageId
            ? today
            : MemberPackageRules.RenewalStart(today, await LatestActiveEndAsync(entity.MemberId, memberPackageId, today, ct));
        var (start, end) = MemberPackageRules.ComputePeriod(startDate,
            entity.DurationDaysSnapshot ?? catalog.DurationDays);
        entity.StartDate = start;
        entity.EndDate = end;
        if (entity.PackageId == DayPass.PackageId)
        {
            var center = await CenterOperatingHours.ReadAsync(settings, ct);
            await gymClosure.LockForActivationAsync(ct);
            if (await gymClosure.IsGymClosedAtAsync(clock.UtcNow, ct))
                throw new ConflictException("gym_closed_today", "The Gym is closed due to an incident; this day pass cannot be activated.");
            if (!DayPassClock.IsOpen(center, clock.UtcNow) || purchaseDay != today)
                throw new ConflictException(PaymentSupportErrorCodes.DayPassOutsideHours,
                    $"This Gym day pass cannot be activated after {center.Closes} Vietnam time.");
            entity.ExpiresAtUtc = DayPassClock.ClosesAtUtc(center, clock.UtcNow);
            entity.EndDate = today;
            end = entity.EndDate;
        }
        entity.Status = MemberPackageStatus.Active;
        audit.Write(new AuditEntry(actorId, "ACTIVATE_MEMBER_PACKAGE", nameof(MemberPackage), memberPackageId.ToString(),
            OldValue: "{\"status\":\"PendingPayment\"}",
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { status = "Active", startDate = start, endDate = end, invoiceId })));
        if (entity.PackageId == DayPass.PackageId)
        {
            // Vé Gym 1 ngày: nhắc rõ mã check-in và vé chỉ có hiệu lực trong ngày thanh toán (giờ Việt Nam).
            var expiresLocal = VietnamTime.ToLocal(entity.ExpiresAtUtc!.Value);
            var text = $"Your Gym day pass is active until {expiresLocal:HH:mm dd/MM/yyyy} (Vietnam time): "
                + "show your member code at reception to check in.";
            notifications.Queue(new NotificationRequest(entity.MemberId, NotificationEvents.PaymentReceived, text, memberPackageId));
            var email = await db.Set<SportHub.Identity.Domain.Entities.UserAccount>().AsNoTracking()
                .Where(u => u.UserId == entity.MemberId).Select(u => u.Email).SingleOrDefaultAsync(ct);
            if (email is not null)
                notifications.QueueEmail(new EmailNotificationRequest(entity.MemberId, email, NotificationEvents.PaymentReceived,
                    memberPackageId, "SportHub - Your Gym day pass", "<p>" + System.Net.WebUtility.HtmlEncode(text) + "</p>"));
            return;
        }

        notifications.Queue(new NotificationRequest(entity.MemberId, NotificationEvents.PaymentReceived,
            $"Package {catalog.Name} is active from {start:dd/MM/yyyy} to {end:dd/MM/yyyy}.", memberPackageId));
    }

    public async Task ReleaseAsync(Guid memberPackageId, CancellationToken ct = default)
    {
        RequireTransaction();
        var entity = await db.Set<MemberPackage>().SingleOrDefaultAsync(x => x.MemberPackageId == memberPackageId, ct);
        if (entity?.Status == MemberPackageStatus.PendingPayment) entity.Status = MemberPackageStatus.Cancelled;
    }

    /// <summary>EndDate muộn nhất trong các Membership đang Active còn hiệu lực hoặc đã xếp lịch nối tiếp của Member.</summary>
    private async Task<DateOnly?> LatestActiveEndAsync(Guid memberId, Guid? excludeId, DateOnly today, CancellationToken ct)
        => await db.Set<MemberPackage>().AsNoTracking()
            .Where(x => x.MemberId == memberId && x.Status == MemberPackageStatus.Active
                && x.EndDate >= today && x.MemberPackageId != excludeId)
            .Select(x => (DateOnly?)x.EndDate)
            .OrderByDescending(x => x)
            .FirstOrDefaultAsync(ct);

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Membership fulfillment requires a caller transaction.");
    }
}
