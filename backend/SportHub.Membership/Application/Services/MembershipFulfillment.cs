using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Services;

public sealed class MembershipFulfillment(ISportHubDbContext db, IAuditWriter audit,
    INotificationWriter notifications, IClock clock) : IMembershipFulfillment
{
    public async Task<MembershipPurchaseQuote> QuoteAsync(int packageId, CancellationToken ct = default)
    {
        var catalog = await db.Set<MembershipPackage>().AsNoTracking().SingleOrDefaultAsync(x => x.PackageId == packageId, ct)
            ?? throw new NotFoundException("membership_package_not_found", "Không tìm thấy gói thành viên.");
        if (!catalog.IsActive) throw new ConflictException("membership_package_discontinued", "Gói này đã ngừng áp dụng.");
        if (catalog.Price <= 0 || catalog.Price % 1000 != 0)
            throw new ConflictException("membership_price_invalid", "Giá gói phải là bội số 1.000 VND.");
        return new(catalog.PackageId, catalog.Name, catalog.Price, catalog.DurationDays, null);
    }

    public async Task<MembershipPurchaseState> GetAsync(Guid memberPackageId, CancellationToken ct = default)
        => await db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberPackageId == memberPackageId)
            .Select(x => new MembershipPurchaseState(x.PackageId, x.StackingApprovedByUserId, x.StackingApprovalReason))
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("member_package_not_found", "Không tìm thấy gói hội viên.");

    public async Task<Guid> PrepareAsync(Guid memberId, int packageId, Guid actorId, bool allowStacking,
        string? stackingReason, CancellationToken ct = default)
    {
        RequireTransaction();
        var quote = await QuoteAsync(packageId, ct);
        if (!allowStacking && await db.Set<MemberPackage>().AnyAsync(x => x.MemberId == memberId
            && x.PackageId == packageId && (x.Status == MemberPackageStatus.Active || x.Status == MemberPackageStatus.PendingPayment), ct))
            throw new ConflictException("duplicate_active_package", "Hội viên đã có gói cùng loại đang hoạt động hoặc chờ thanh toán.");
        var id = Guid.NewGuid();
        var (pendingStart, pendingEnd) = MemberPackageRules.ComputePeriod(VietnamTime.TodayLocal(clock), quote.DurationDays);
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
            throw new ConflictException("membership_invoice_conflict", "Gói đã liên kết hóa đơn khác.");
        entity.InvoiceItemId = itemId;
    }

    public async Task ActivateAsync(Guid memberPackageId, Guid invoiceId, Guid actorId, CancellationToken ct = default)
    {
        RequireTransaction();
        var entity = await db.Set<MemberPackage>().SingleAsync(x => x.MemberPackageId == memberPackageId, ct);
        if (entity.Status == MemberPackageStatus.Active) return;
        if (entity.Status != MemberPackageStatus.PendingPayment)
            throw new ConflictException("membership_inactive", "Gói không còn chờ thanh toán.");
        var catalog = await db.Set<MembershipPackage>().SingleAsync(x => x.PackageId == entity.PackageId, ct);
        if (entity.StackingApprovedByUserId is null && await db.Set<MemberPackage>().AnyAsync(x =>
            x.MemberId == entity.MemberId && x.PackageId == entity.PackageId && x.MemberPackageId != memberPackageId
            && x.Status == MemberPackageStatus.Active, ct))
            throw new ConflictException("package_stacking_not_approved", "Cộng dồn cùng loại gói phải được Manager duyệt trước.");
        var (start, end) = MemberPackageRules.ComputePeriod(VietnamTime.TodayLocal(clock),
            entity.DurationDaysSnapshot ?? catalog.DurationDays);
        entity.StartDate = start;
        entity.EndDate = end;
        entity.Status = MemberPackageStatus.Active;
        audit.Write(new AuditEntry(actorId, "ACTIVATE_MEMBER_PACKAGE", nameof(MemberPackage), memberPackageId.ToString(),
            OldValue: "{\"status\":\"PendingPayment\"}",
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { status = "Active", startDate = start, endDate = end, invoiceId })));
        notifications.Queue(new NotificationRequest(entity.MemberId, NotificationEvents.PaymentReceived,
            $"Gói {catalog.Name} đã được kích hoạt, hiệu lực từ {start:dd/MM/yyyy} đến {end:dd/MM/yyyy}.", memberPackageId));
    }

    public async Task ReleaseAsync(Guid memberPackageId, CancellationToken ct = default)
    {
        RequireTransaction();
        var entity = await db.Set<MemberPackage>().SingleOrDefaultAsync(x => x.MemberPackageId == memberPackageId, ct);
        if (entity?.Status == MemberPackageStatus.PendingPayment) entity.Status = MemberPackageStatus.Cancelled;
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Membership fulfillment requires a caller transaction.");
    }
}
