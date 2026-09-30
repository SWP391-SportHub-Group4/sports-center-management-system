using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Membership.Application.Services;

/// <summary>Membership owns entitlement lookup/cancellation; mutations join Payment's transaction.</summary>
public sealed class MembershipRefundFulfillment(ISportHubDbContext db, IAuditWriter audit) : IMembershipRefundFulfillment
{
    public async Task<MembershipRefundFacts?> GetFactsAsync(Guid invoiceItemId, Guid? relatedMemberPackageId,
        CancellationToken cancellationToken = default)
    {
        var package = await db.Set<MemberPackage>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.InvoiceItemId == invoiceItemId
                || (relatedMemberPackageId != null && x.MemberPackageId == relatedMemberPackageId), cancellationToken);
        return package is null ? null : new MembershipRefundFacts(package.MemberId,
            package.StartDate, package.EndDate, package.Status == MemberPackageStatus.Active);
    }

    public async Task CancelAsync(Guid invoiceItemId, Guid? relatedMemberPackageId, string reason, Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Membership refund fulfillment requires the caller's transaction.");
        var package = await db.Set<MemberPackage>().FromSqlInterpolated($"""
                SELECT * FROM member_packages
                WHERE invoice_item_id = {invoiceItemId} OR member_package_id = {relatedMemberPackageId}
                ORDER BY (invoice_item_id = {invoiceItemId}) DESC
                LIMIT 1 FOR UPDATE
                """).SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("membership_refund_entitlement_not_found", "Không tìm thấy Membership của hóa đơn này.");
        if (package.Status == MemberPackageStatus.Cancelled) return;
        if (package.Status != MemberPackageStatus.Active)
            throw new ConflictException("membership_refund_not_active", "Chỉ Membership đang hiệu lực mới thể hủy khi hoàn điểm.");

        package.Status = MemberPackageStatus.Cancelled;
        audit.Write(new AuditEntry(actorUserId, "CANCEL_MEMBERSHIP_FOR_REFUND", nameof(MemberPackage),
            package.MemberPackageId.ToString(), Reason: reason));
        await db.SaveChangesAsync(cancellationToken);
    }
}
