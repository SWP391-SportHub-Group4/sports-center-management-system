using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Membership;


using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Infrastructure;

namespace SportHub.Payment.Application.Services;

public sealed class PackagePurchaseService(
    ISportHubDbContext db,
    IInvoiceNumberGenerator invoiceNumbers,
    IUserAccessReader users, IMembershipFulfillment memberships,
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
        var member = await users.GetAsync(request.MemberId, ct)
            ?? throw new NotFoundException("member_not_found", "Không tìm thấy hội viên.");
        if (member.Role != "Member") throw new BadRequestException("not_a_member", "Chỉ bán gói cho tài khoản Hội viên.");
        if (!member.IsActive) throw new ConflictException("member_not_active", "Tài khoản hội viên không hoạt động.");
        var catalog = await memberships.QuoteAsync(request.PackageId, ct);
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
                if (existing.MemberId != request.MemberId || (await memberships.GetAsync(existing.MemberPackageId!.Value, ct)).PackageId != request.PackageId)
                    throw new ConflictException("idempotency_key_reused", "Khóa idempotency đã dùng cho giao dịch khác.");
                await transaction.CommitAsync(ct);
                return await invoiceQuery.GetDetailAsync(existing.InvoiceId, ct);
            }
        }
        var memberPackageId = await memberships.PrepareAsync(request.MemberId, request.PackageId,
            actorUserId, request.AllowStacking, request.StackingApprovalReason, ct);
        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(),
            InvoiceNumber = await invoiceNumbers.NextAsync(now, ct),
            MemberId = request.MemberId,
            IssuedByUserId = actorUserId,
            MemberPackageId = memberPackageId,
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
            RelatedEntityId = memberPackageId, MemberPackageId = memberPackageId
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
        await memberships.AttachItemAsync(memberPackageId, invoiceItem.ItemId, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoice.InvoiceId, ct);
    }

}

