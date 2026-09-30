using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Commands.Refunds;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>Point refunds use the shared PaymentAdjustment table but are item-scoped and atomic.</summary>
public sealed class PointRefundService(
    ISportHubDbContext db,
    IPointWalletService wallets,
    IMembershipRefundFulfillment memberships,
    IPtPurchaseFulfillment pt,
    IClassEnrollmentFulfillment classes,
    ICourtRentalFulfillment rentals,
    ISystemSettingProvider settings,
    IAuditWriter audit,
    IClock clock) : IPointRefundService
{
    public async Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(string? status, Guid? invoiceId,
        Guid? invoiceItemId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);
        var query = db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.Type == PaymentAdjustmentType.Refund);
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<PaymentAdjustmentStatus>(status, true, out var parsed))
                throw new BadRequestException("invalid_status", $"Trạng thái refund không hợp lệ: '{status}'.");
            query = query.Where(x => x.Status == parsed);
        }
        if (invoiceId is not null) query = query.Where(x => x.InvoiceId == invoiceId);
        if (invoiceItemId is not null) query = query.Where(x => x.InvoiceItemId == invoiceItemId);
        var total = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(InvoiceQueryService.AdjustmentProjection()).ToListAsync(cancellationToken);
        return new PagedResult<PaymentAdjustmentResponse>
        {
            Items = items, Page = page, PageSize = pageSize, TotalCount = total
        };
    }

    public async Task<PaymentAdjustmentResponse> RequestAsync(Guid invoiceItemId, string reason,
        Guid actorUserId, bool canRequestForAnotherUser, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("refund_reason_required", "Cần nhập lý do hoàn dài 3–500 ký tự.");
        var item = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == invoiceItemId, cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);
        if (!canRequestForAnotherUser && invoice.MemberId != actorUserId)
            throw new ForbiddenException("refund_item_not_owned", "Hóa đơn không thuộc tài khoản của bạn.");
        if (invoice.Status != InvoiceStatus.Paid)
            throw new ConflictException("refund_invoice_not_paid", "Chỉ hóa đơn Paid đã cấp quyền lợi mới được yêu cầu hoàn.");
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, cancellationToken);
        var itemPaidVnd = await GetRemainingItemPaidVndAsync(invoice, item, cancellationToken);
        var calculated = await CalculatePointsAsync(item, itemPaidVnd, VietnamTime.TodayLocal(clock), false, cancellationToken, clock.UtcNow);

        var adjustment = new PaymentAdjustment
        {
            AdjustmentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, InvoiceItemId = invoiceItemId,
            Type = PaymentAdjustmentType.Refund, Amount = 0, RequestedAmount = 0,
            Reason = reason.Trim(), Status = PaymentAdjustmentStatus.Requested,
            RequestedByUserId = actorUserId, CreatedAt = clock.UtcNow,
            SystemCalculatedPoints = Math.Max(0, calculated), ApprovedPoints = 0
        };
        db.Set<PaymentAdjustment>().Add(adjustment);
        audit.Write(new AuditEntry(actorUserId, "REQUEST_POINT_REFUND", nameof(PaymentAdjustment),
            adjustment.AdjustmentId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                invoiceItemId, systemCalculatedPoints = adjustment.SystemCalculatedPoints
            }), Reason: adjustment.Reason));
        await db.SaveChangesAsync(cancellationToken);
        return await GetOneAsync(adjustment.AdjustmentId, cancellationToken);
    }

    public async Task<PaymentAdjustmentResponse> ApproveAsync(Guid adjustmentId,
        ApprovePointRefundRequest request, Guid managerUserId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("refund_approval_reason_required", "Cần nhập lý do duyệt refund.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var adjustment = await LockAdjustmentAsync(adjustmentId, cancellationToken);
        if (adjustment.Type != PaymentAdjustmentType.Refund || adjustment.InvoiceItemId is null)
            throw new ConflictException("legacy_refund_not_supported", "Refund legacy cần được đối soát riêng.");
        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
            throw new ConflictException("refund_already_resolved", $"Refund đang ở trạng thái {adjustment.Status}.");
        if (adjustment.RequestedByUserId == managerUserId)
            throw new ForbiddenException("cannot_approve_own_request", "Không được tự duyệt yêu cầu refund của mình.");

        var invoice = await db.Set<Invoice>().SingleAsync(x => x.InvoiceId == adjustment.InvoiceId, cancellationToken);
        if (invoice.Status != InvoiceStatus.Paid)
            throw new ConflictException("refund_invoice_not_paid", "Hóa đơn không còn trạng thái Paid.");
        var item = await db.Set<InvoiceItem>().FromSqlInterpolated($"""
            SELECT * FROM invoice_items WHERE item_id = {adjustment.InvoiceItemId.Value} FOR UPDATE
            """).SingleAsync(cancellationToken);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, cancellationToken);

        var requestDate = DateOnly.FromDateTime(VietnamTime.ToLocal(adjustment.CreatedAt));
        var itemPaidVnd = await GetRemainingItemPaidVndAsync(invoice, item, cancellationToken);
        var allowedByRule = await CalculatePointsAsync(item, itemPaidVnd, requestDate,
            request.CenterFault, cancellationToken, adjustment.CreatedAt);
        var absoluteCap = checked((int)decimal.Floor(itemPaidVnd / RefundCalculator.VndPerPoint));
        var points = allowedByRule;
        if (points <= 0)
            throw new ConflictException("refund_points_zero", "Theo quy tắc hiện hành không có điểm để hoàn.");
        if (points > absoluteCap)
            throw new ConflictException("refund_exceeds_item_paid", $"Số điểm vượt trần còn lại của item ({absoluteCap}).");
        if (request.CenterFault && request.Reason.Trim().Length < 10)
            throw new BadRequestException("center_fault_reason_required", "Center Fault cần mô tả căn cứ cụ thể (ít nhất 10 ký tự).");

        var reason = request.Reason.Trim();
        var wallet = await wallets.EarnAsync(new WalletOperation(invoice.MemberId, points,
            "PaymentAdjustment", adjustment.AdjustmentId, managerUserId, reason, item.ItemId), cancellationToken);
        await CancelEntitlementAsync(item, reason, request.CenterFault, managerUserId, cancellationToken);

        var now = clock.UtcNow;
        adjustment.CenterFault = request.CenterFault;
        adjustment.ApprovedPoints = points;
        adjustment.PointLedgerEntryId = wallet.LedgerEntryId;
        adjustment.ApprovedByUserId = managerUserId;
        adjustment.ApprovedAtUtc = now;
        adjustment.CompletedAtUtc = now;
        adjustment.ResolvedAt = now;
        adjustment.Status = PaymentAdjustmentStatus.Completed;
        audit.Write(new AuditEntry(managerUserId, "APPROVE_POINT_REFUND", nameof(PaymentAdjustment),
            adjustment.AdjustmentId.ToString(), OldValue: "{\"status\":\"Requested\"}",
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                status = "Completed", invoiceItemId = item.ItemId, points, ledgerEntryId = wallet.LedgerEntryId,
                centerFault = request.CenterFault
            }), Reason: reason));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await GetOneAsync(adjustmentId, cancellationToken);
    }

    public async Task<PaymentAdjustmentResponse> RejectAsync(Guid adjustmentId, string reason,
        Guid managerUserId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("refund_rejection_reason_required", "Cần nhập lý do từ chối refund.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var adjustment = await LockAdjustmentAsync(adjustmentId, cancellationToken);
        if (adjustment.Type != PaymentAdjustmentType.Refund || adjustment.InvoiceItemId is null)
            throw new ConflictException("legacy_refund_not_supported", "Refund legacy cần được đối soát riêng.");
        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
            throw new ConflictException("refund_already_resolved", $"Refund đang ở trạng thái {adjustment.Status}.");
        if (adjustment.RequestedByUserId == managerUserId)
            throw new ForbiddenException("cannot_approve_own_request", "Không được tự xử lý yêu cầu refund của mình.");
        adjustment.Status = PaymentAdjustmentStatus.Rejected;
        adjustment.ApprovedByUserId = managerUserId;
        adjustment.ApprovedAtUtc = clock.UtcNow;
        adjustment.ResolvedAt = clock.UtcNow;
        audit.Write(new AuditEntry(managerUserId, "REJECT_POINT_REFUND", nameof(PaymentAdjustment),
            adjustment.AdjustmentId.ToString(), OldValue: "{\"status\":\"Requested\"}",
            NewValue: "{\"status\":\"Rejected\"}", Reason: reason.Trim()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await GetOneAsync(adjustmentId, cancellationToken);
    }

    private async Task<int> CalculatePointsAsync(InvoiceItem item, decimal paidVnd,
        DateOnly requestDate, bool centerFault, CancellationToken ct, DateTime? requestedAtUtc = null)
    {
        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
            {
                var facts = await memberships.GetFactsAsync(item.ItemId, item.RelatedEntityId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Không tìm thấy Membership gắn với item.");
                if (!facts.IsActive && !centerFault) return 0;
                return RefundCalculator.MembershipPoints(paidVnd, facts.StartDate, facts.EndDate,
                    requestDate, centerFault);
            }
            case InvoiceItemType.PT:
            {
                var facts = await pt.GetRefundFactsAsync(item.ItemId, item.RelatedEntityId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Không tìm thấy PT entitlement gắn với item.");
                if (facts.Status != "Active" && !centerFault) return 0;
                return RefundCalculator.PtPoints(paidVnd, facts.ConsumedSessions > 0, centerFault);
            }
            case InvoiceItemType.ClassPackage:
            {
                var facts = await classes.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Không tìm thấy enrollment gắn với item.");
                if (!facts.EnrollmentActive && !centerFault) return 0;
                return RefundCalculator.ClassPoints(paidVnd, facts.TotalProvidedSessions,
                    facts.SessionsNotProvided, clock.UtcNow < facts.FirstSessionUtc, centerFault);
            }
            case InvoiceItemType.Rental:
            {
                var facts = await rentals.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Không tìm thấy lượt thuê gắn với item.");
                var instantUtc = DateTime.SpecifyKind(requestedAtUtc ?? clock.UtcNow, DateTimeKind.Utc);
                var requestAtVietnam = new DateTimeOffset(instantUtc, TimeSpan.Zero).ToOffset(VietnamTime.Offset);
                var freeCancelHours = await settings.GetIntAsync(SystemSettingKeys.RentalCancelFreeHours, ct);
                return RefundCalculator.RentalPoints(paidVnd, requestAtVietnam,
                    facts.StartUtc.ToOffset(VietnamTime.Offset), centerFault || facts.IsCancelledByCenter, freeCancelHours);
            }
            default:
                throw new ConflictException("refund_item_type_unsupported", "Loại item này chưa được hỗ trợ refund.");
        }
    }

    private async Task CancelEntitlementAsync(InvoiceItem item, string reason, bool centerFault, Guid actorId, CancellationToken ct)
    {
        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
                await memberships.CancelAsync(item.ItemId, item.RelatedEntityId, reason, actorId, ct);
                break;
            case InvoiceItemType.PT:
                await pt.CancelByInvoiceItemAsync(item.ItemId, item.RelatedEntityId, reason, actorId, ct);
                break;
            case InvoiceItemType.ClassPackage:
                await classes.CancelAsync(item.ItemId, EnrollmentEndReason.Refunded, ct);
                break;
            case InvoiceItemType.Rental:
                if (item.RelatedEntityId is not Guid rentalId)
                    throw new ConflictException("refund_entitlement_not_found", "Refund thuê sân thiếu lượt thuê.");
                await rentals.CancelAsync(rentalId, reason, centerFault, cancellationToken: ct);
                break;
        }
    }

    private async Task<decimal> GetRemainingItemPaidVndAsync(Invoice invoice, InvoiceItem item, CancellationToken ct)
    {
        var totalItemValue = await db.Set<InvoiceItem>().Where(x => x.InvoiceId == invoice.InvoiceId)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        if (totalItemValue <= 0 || item.LineAmount <= 0)
            throw new ConflictException("refund_item_value_invalid", "InvoiceItem không có giá trị dương.");
        var cash = await db.Set<Domain.Entities.Payment>().Where(x => x.InvoiceId == invoice.InvoiceId
                && x.Status == PaymentStatus.Success).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var points = invoice.CheckoutCycleId is not null && invoice.Status == InvoiceStatus.Paid
            ? invoice.PointsApplied * (decimal)RefundCalculator.VndPerPoint : 0m;
        var paidShare = Math.Min(item.LineAmount,
            decimal.Floor((cash + points) * item.LineAmount / totalItemValue));
        var paidTransferDifferences = await db.Set<InvoiceItem>().Where(x => x.SourceInvoiceItemId == item.ItemId
                && x.Invoice!.Status == InvoiceStatus.Paid)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        var priorPoints = await CompletedPointsForItemAsync(item.ItemId, ct);
        var priorLegacyPayout = await db.Set<PaymentAdjustment>().Where(x => x.InvoiceItemId == item.ItemId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed
                && x.ApprovedPoints == 0)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var priorSystemPoints = await db.Set<PointLedgerEntry>().Where(x => x.InvoiceItemId == item.ItemId
                && x.ReferenceType == "SystemEvent" && x.EntryType == PointEntryType.Earn)
            .SumAsync(x => (int?)x.Points, ct) ?? 0;
        var priorTransferPoints = await db.Set<PointLedgerEntry>().Where(x => x.InvoiceItemId == item.ItemId
                && x.ReferenceType == "ClassTransferDifference" && x.EntryType == PointEntryType.Earn)
            .SumAsync(x => (int?)x.Points, ct) ?? 0;
        return Math.Max(0m, paidShare + paidTransferDifferences - (priorPoints + priorSystemPoints)
            * (decimal)RefundCalculator.VndPerPoint - priorLegacyPayout
            - priorTransferPoints * (decimal)RefundCalculator.VndPerPoint);
    }

    private async Task<int> CompletedPointsForItemAsync(Guid invoiceItemId, CancellationToken ct)
        => await db.Set<PaymentAdjustment>().Where(x => x.InvoiceItemId == invoiceItemId
            && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(x => (int?)x.ApprovedPoints, ct) ?? 0;

    private async Task EnsureNoUnmappedLegacyRefundAsync(Guid invoiceId, CancellationToken ct)
    {
        if (await db.Set<PaymentAdjustment>().AnyAsync(x => x.InvoiceId == invoiceId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed
                && x.InvoiceItemId == null, ct))
            throw new ConflictException("legacy_refund_needs_reconciliation",
                "Hóa đơn có refund legacy chưa gắn item; cần đối soát trước khi hoàn tiếp.");
    }

    private async Task<PaymentAdjustment> LockAdjustmentAsync(Guid adjustmentId, CancellationToken ct)
    {
        var invoiceId = await db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.AdjustmentId == adjustmentId)
            .Select(x => (Guid?)x.InvoiceId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("refund_not_found", "Không tìm thấy yêu cầu refund.");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE", ct);
        var rows = await db.Set<PaymentAdjustment>()
            .FromSqlInterpolated($"SELECT * FROM payment_adjustments WHERE adjustment_id = {adjustmentId} FOR UPDATE")
            .ToListAsync(ct);
        return rows.Single();
    }

    private Task<PaymentAdjustmentResponse> GetOneAsync(Guid id, CancellationToken ct)
        => db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.AdjustmentId == id)
            .Select(InvoiceQueryService.AdjustmentProjection()).SingleAsync(ct);
}
