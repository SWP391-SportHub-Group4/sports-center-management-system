using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Infrastructure;

namespace SportHub.Payment.Application.Services;

public interface IPackagePurchaseService
{
    Task<InvoiceDetailDto> PurchaseAsync(
        PurchasePackageRequest request, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);
}

/// <summary>
/// BR-30 — chọn gói thì PHÁT HÀNH HOÁ ĐƠN NGAY, trước khi thu bất kỳ khoản nào; gói ở trạng
/// thái PendingPayment và chỉ chuyển Active sau khi hoá đơn được thanh toán đầy đủ
/// (việc đó do PaymentService làm).
///
/// Nằm ở module Payment chứ không phải Membership: MemberPackage và Invoice phải sinh trong
/// cùng một transaction, mà Payment là module sở hữu Invoice — để Membership tham chiếu
/// ngược Payment sẽ tạo vòng phụ thuộc.
/// </summary>
public sealed class PackagePurchaseService(
    ISportHubDbContext db,
    IInvoiceNumberGenerator invoiceNumbers,
    IInvoiceQueryService invoiceQuery,
    IAuditWriter audit,
    IClock clock) : IPackagePurchaseService
{
    public async Task<InvoiceDetailDto> PurchaseAsync(
        PurchasePackageRequest request,
        Guid actorUserId,
        bool actorIsCenterManager,
        CancellationToken ct = default)
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

        // BR-10 — ngoại lệ cộng dồn phải do Center Manager cho phép RÕ RÀNG và có lý do.
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
        else
        {
            await EnsureNoActiveSamePackageAsync(request.MemberId, request.PackageId, ct);
        }

        var now = clock.UtcNow;

        // Transaction tường minh: hoá đơn và gói phải cùng có hoặc cùng không (BR-30).
        // Một gói PendingPayment không hoá đơn sẽ không bao giờ kích hoạt được; một hoá đơn
        // không gói thì thu tiền xong chẳng mở ra quyền lợi nào.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var memberPackage = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = request.MemberId,
            PackageId = catalog.PackageId,

            // Ngày hiệu lực THẬT được đặt lại khi hoá đơn thanh toán đủ (BR-30, quyết định C4).
            // Ở đây chỉ là chỗ giữ: gói chưa Active nên các giá trị này chưa có tác dụng.
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
            Status = InvoiceStatus.Issued,
            IssuedAt = now,

            // BR-55 — hạn ban đầu 2 tháng; mốc 12 tháng chỉ tính khi nhận cọc đầu tiên.
            DueDateUtc = InvoiceMath.InitialDueDate(now),
            FirstDepositAtUtc = null
        };

        db.Set<Invoice>().Add(invoice);

        db.Set<InvoiceItem>().Add(new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            Description = $"Gói {catalog.Name} ({catalog.DurationDays} ngày"
                          + (catalog.SessionLimit is null ? ", không giới hạn buổi)" : $", {catalog.SessionLimit} buổi)"),
            Amount = catalog.Price,
            RelatedEntityType = InvoiceItemRelatedEntityType.Package,
            RelatedEntityId = memberPackage.MemberPackageId
        });

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
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoice.InvoiceId, ct);
    }

    /// <summary>
    /// BR-10 — "cùng loại" được hiểu là cùng PackageId (cùng bản ghi catalog); catalog không có
    /// trường phân loại nào khác để hiểu rộng hơn. Xem implementation-decisions.md A5.
    ///
    /// Tính cả gói PendingPayment: nếu bỏ qua, hội viên có thể tạo nhiều hoá đơn cho cùng một
    /// gói rồi thanh toán lần lượt và lách hẳn được ràng buộc.
    /// </summary>
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
