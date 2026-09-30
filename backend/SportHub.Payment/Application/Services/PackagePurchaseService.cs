using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Infrastructure;

namespace SportHub.Payment.Application.Services;

public sealed class PackagePurchaseService(
    ISportHubDbContext db,
    IInvoiceNumberGenerator invoiceNumbers,
    IInvoiceQueryService invoiceQuery,
    IAuditWriter audit,
    ISystemSettingProvider settings,
    IClock clock) : IPackagePurchaseService
{
    public async Task<InvoiceDetailResponse> PurchaseAsync(
        PurchasePackageRequest request,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default,
        string? idempotencyKey = null)
    {
        var member = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .SingleOrDefaultAsync(u => u.UserId == request.MemberId, ct)
            ?? throw new NotFoundException("member_not_found", "Không tìm thấy hội viên.");

        if (member.Role!.RoleName != UserRole.Member)
        {
            throw new BadRequestException("not_a_member", "Chỉ bán gói cho tài khoản có vai trò Hội viên.");
        }

        if (member.Status != UserStatus.Active)
        {
            throw new ConflictException(
                "member_not_active", "Tài khoản hội viên đang bị khóa hoặc ngừng hoạt động.");
        }

        var catalog = await db.Set<MembershipPackage>()
            .SingleOrDefaultAsync(p => p.PackageId == request.PackageId, ct)
            ?? throw new NotFoundException("membership_package_not_found", "Không tìm thấy gói thành viên.");

        if (!catalog.IsActive)
        {
            throw new ConflictException(
                "membership_package_discontinued", "Gói này đã ngừng áp dụng, không bán mới được (BR-8).");
        }

        if (idempotencyKey is not null && (catalog.Price <= 0 || catalog.Price % 1000 != 0))
            throw new ConflictException("membership_price_invalid", "Giá gói phải là bội số 1.000 VND.");

        if (request.AllowStacking)
        {
            if (!actorIsCenterManager)
            {
                throw new ForbiddenException(
                    "stacking_requires_manager",
                    "Chỉ Quản lý Trung tâm mới được cho phép cộng dồn gói (BR-10).");
            }

            if (string.IsNullOrWhiteSpace(request.StackingApprovalReason))
            {
                throw new BadRequestException(
                    "stacking_reason_required", "Phải nhập lý do khi cho phép cộng dồn gói (BR-10).");
            }
        }
        var now = clock.UtcNow;
        var holdMinutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {request.MemberId} FOR UPDATE", ct);
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = await db.Set<CheckoutSession>().AsNoTracking()
                .Where(x => x.IdempotencyKey == idempotencyKey && x.Kind == "Membership"
                    && x.ExpiresAtUtc > now)
                .Join(db.Set<Invoice>(), s => s.InvoiceId, i => i.InvoiceId,
                    (s, i) => new { s.InvoiceId, i.MemberId, i.MemberPackageId })
                .SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                if (existing.MemberId != request.MemberId || !await db.Set<MemberPackage>()
                        .AnyAsync(x => x.MemberPackageId == existing.MemberPackageId && x.PackageId == request.PackageId, ct))
                    throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho giao dịch khác.");
                await transaction.CommitAsync(ct);
                return await invoiceQuery.GetDetailAsync(existing.InvoiceId, ct);
            }
        }
        if (!request.AllowStacking)
            await EnsureNoActiveSamePackageAsync(request.MemberId, request.PackageId, ct);

        var memberPackage = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = request.MemberId,
            PackageId = catalog.PackageId,

            StartDate = VietnamTime.TodayLocal(clock),
            EndDate = VietnamTime.TodayLocal(clock),
            RemainingSessions = catalog.SessionLimit,
            Status = MemberPackageStatus.PendingPayment,
            StackingApprovedByUserId = request.AllowStacking ? actorUserId : null,
            StackingApprovalReason = request.AllowStacking ? request.StackingApprovalReason!.Trim() : null
        };

        db.Set<MemberPackage>().Add(memberPackage);

        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(),
            InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = request.MemberId,
            IssuedByUserId = actorUserId,
            MemberPackageId = memberPackage.MemberPackageId,
            TotalAmount = catalog.Price,
            CheckoutCycleId = Guid.NewGuid(),
            CheckoutRevision = 1,
            HoldExpiresAtUtc = now.AddMinutes(holdMinutes),
            CashAmount = catalog.Price,
            Status = InvoiceStatus.Issued,
            IssuedAt = now
        };

        db.Set<Invoice>().Add(invoice);
        if (idempotencyKey is not null) db.Set<CheckoutSession>().Add(new CheckoutSession
        {
            CheckoutSessionId = invoice.CheckoutCycleId!.Value, InvoiceId = invoice.InvoiceId,
            Revision = 1, Kind = "Membership", State = "Active",
            IdempotencyKey = idempotencyKey,
            CreatedAtUtc = now, ExpiresAtUtc = invoice.HoldExpiresAtUtc!.Value
        });

        var invoiceItem = new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            ItemType = InvoiceItemType.Membership,
            Description = $"Gói {catalog.Name} ({catalog.DurationDays} ngày"
                          + (catalog.SessionLimit is null ? ", không giới hạn buổi)" : $", {catalog.SessionLimit} buổi)"),
            UnitPrice = catalog.Price,
            Quantity = 1,
            LineAmount = catalog.Price,
            RelatedEntityId = memberPackage.MemberPackageId
        };
        db.Set<InvoiceItem>().Add(invoiceItem);

        audit.Write(new AuditEntry(
            actorUserId,
            "ISSUE_PACKAGE_INVOICE",
            nameof(Invoice),
            invoice.InvoiceId.ToString(),
            NewValue: $"{{\"invoiceNumber\":\"{invoice.InvoiceNumber}\",\"memberId\":\"{request.MemberId}\","
                      + $"\"packageId\":{catalog.PackageId},\"totalAmount\":{invoice.TotalAmount},"
                      + $"\"allowStacking\":{request.AllowStacking.ToString().ToLowerInvariant()}}}",
            Reason: request.AllowStacking ? request.StackingApprovalReason!.Trim() : null));

        await db.SaveChangesAsync(ct);
        memberPackage.InvoiceItemId = invoiceItem.ItemId;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoice.InvoiceId, ct);
    }

    private async Task EnsureNoActiveSamePackageAsync(Guid memberId, int packageId, CancellationToken ct)
    {
        var exists = await db.Set<MemberPackage>()
            .AnyAsync(
                mp => mp.MemberId == memberId
                      && mp.PackageId == packageId
                      && (mp.Status == MemberPackageStatus.Active || mp.Status == MemberPackageStatus.PendingPayment),
                ct);

        if (exists)
        {
            throw new ConflictException(
                "duplicate_active_package",
                "Hội viên đã có gói cùng loại đang hoạt động hoặc chờ thanh toán. "
                + "Chỉ Quản lý Trung tâm mới được cho phép cộng dồn (BR-10).");
        }
    }
}
