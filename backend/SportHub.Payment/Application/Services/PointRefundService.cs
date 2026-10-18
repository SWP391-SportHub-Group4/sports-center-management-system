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
using SportHub.Membership.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>Point refunds use the shared PaymentAdjustment table but are item-scoped and atomic.</summary>
public sealed class PointRefundService(
    ISportHubDbContext db,
    IPointWalletService wallets,
    IMembershipRefundFulfillment memberships,
    IClassEnrollmentFulfillment classes,
    ICourtRentalFulfillment rentals,
    ISystemSettingProvider settings,
    IAuditWriter audit,
    IClock clock, PaymentNoticeService notices) : IPointRefundService
{
    public async Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(string? status, Guid? invoiceId,
        Guid? invoiceItemId, int page, int pageSize, CancellationToken cancellationToken = default)
        => await SearchCoreAsync(status, invoiceId, invoiceItemId, null, page, pageSize, cancellationToken);

    public Task<PagedResult<PaymentAdjustmentResponse>> SearchMineAsync(Guid memberUserId, string? status,
        int page, int pageSize, CancellationToken cancellationToken = default)
        => SearchCoreAsync(status, null, null, memberUserId, page, pageSize, cancellationToken);

    private async Task<PagedResult<PaymentAdjustmentResponse>> SearchCoreAsync(string? status, Guid? invoiceId,
        Guid? invoiceItemId, Guid? memberUserId, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);
        var query = db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.Type == PaymentAdjustmentType.Refund);
        if (memberUserId is not null)
            query = query.Where(x => x.InvoiceItemId != null && x.Invoice != null && x.Invoice.MemberId == memberUserId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PaymentAdjustmentStatus>(status, true, out var parsed))
                throw new BadRequestException("invalid_status", "Invalid status.");
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

    public async Task<int> QuoteAsync(Guid invoiceItemId, Guid actorUserId, bool canRequestForAnotherUser, CancellationToken ct)
    {
        var item = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == invoiceItemId, ct)
            ?? throw new NotFoundException("invoice_item_not_found", "Invoice item not found.");
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, ct);
        if (!canRequestForAnotherUser && invoice.MemberId != actorUserId)
            throw new ForbiddenException("refund_item_not_owned", "Refund item not owned.");
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Refund invoice not paid.");
        await EnsureNotDayPassAsync(item, ct);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, ct);
        var itemPaidVnd = await GetRemainingItemPaidVndAsync(invoice, item, ct);
        var calculated = await CalculatePointsAsync(item, itemPaidVnd, VietnamTime.TodayLocal(clock), false, ct, clock.UtcNow);

        return Math.Max(0, calculated);
    }

    public async Task<PaymentAdjustmentResponse> RequestAsync(Guid invoiceItemId, string reason,
        Guid actorUserId, bool canRequestForAnotherUser, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("refund_reason_required", "Refund reason required.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var item = await db.Set<InvoiceItem>().FromSqlInterpolated($"SELECT * FROM invoice_items WHERE item_id = {invoiceItemId} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Invoice item not found.");
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);
        if (!canRequestForAnotherUser && invoice.MemberId != actorUserId)
            throw new ForbiddenException("refund_item_not_owned", "Refund item not owned.");
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Refund invoice not paid.");
        await EnsureNotDayPassAsync(item, cancellationToken);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, cancellationToken);
        var itemPaidVnd = await GetRemainingItemPaidVndAsync(invoice, item, cancellationToken);
        var calculated = await CalculatePointsAsync(item, itemPaidVnd, VietnamTime.TodayLocal(clock), false, cancellationToken, clock.UtcNow);

        var existing = await db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.InvoiceItemId == invoiceItemId && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Requested).Select(x => (Guid?)x.AdjustmentId).FirstOrDefaultAsync(cancellationToken);
        if (existing.HasValue) { await transaction.CommitAsync(cancellationToken); return await GetOneAsync(existing.Value, cancellationToken); }

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
        await transaction.CommitAsync(cancellationToken);
        return await GetOneAsync(adjustment.AdjustmentId, cancellationToken);
    }

    public Task<PaymentAdjustmentResponse> CancelClassEnrollmentAsync(Guid invoiceItemId, Guid actorUserId,
        bool canActForAnotherUser, CancellationToken cancellationToken = default)
        => SelfCancelAsync(invoiceItemId, actorUserId, canActForAnotherUser, InvoiceItemType.ClassPackage, cancellationToken);

    public Task<PaymentAdjustmentResponse> CancelMembershipAsync(Guid invoiceItemId, Guid actorUserId,
        bool canActForAnotherUser, CancellationToken cancellationToken = default)
        => SelfCancelAsync(invoiceItemId, actorUserId, canActForAnotherUser, InvoiceItemType.Membership, cancellationToken);

    /// <summary>
    /// Hủy quyền lợi và hoàn điểm tự động theo quy tắc (lớp: mốc 5 ngày; Membership: còn từ 2/3 thời hạn hoàn 50%).
    /// Dùng chung cho Member tự hủy và Lễ tân/Manager hủy thay.
    /// </summary>
    private async Task<PaymentAdjustmentResponse> SelfCancelAsync(Guid invoiceItemId, Guid actorUserId,
        bool canActForAnotherUser, InvoiceItemType type, CancellationToken cancellationToken)
    {
        var isClass = type == InvoiceItemType.ClassPackage;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var item = await db.Set<InvoiceItem>().FromSqlInterpolated($"SELECT * FROM invoice_items WHERE item_id = {invoiceItemId} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Invoice item not found.");
        if (item.ItemType != type)
            throw new ConflictException("cancel_wrong_item", "Cancel wrong item.");
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);
        if (!canActForAnotherUser && invoice.MemberId != actorUserId)
            throw new ForbiddenException("refund_item_not_owned", "Refund item not owned.");
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Refund invoice not paid.");
        await EnsureNotDayPassAsync(item, cancellationToken);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, cancellationToken);
        var now = clock.UtcNow;
        if (isClass)
        {
            var facts = await classes.GetRefundFactsAsync(item.ItemId, cancellationToken)
                ?? throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
            if (facts.FirstSessionUtc <= now)
                throw new ConflictException("class_already_started",
                    "Class already started.");
        }
        else
        {
            var facts = await memberships.GetFactsAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, cancellationToken)
                ?? throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
            if (!facts.IsActive)
                throw new ConflictException("membership_not_active", "Membership not active.");
            if (facts.HasLaterRenewal)
                throw new ConflictException("membership_has_renewal",
                    "Membership has renewal.");
        }
        var paid = await GetRemainingItemPaidVndAsync(invoice, item, cancellationToken);
        var points = await CalculatePointsAsync(item, paid, VietnamTime.TodayLocal(clock), false, cancellationToken, now);
        if (points <= 0)
            throw new ConflictException("refund_points_zero", isClass
                ? "No refundable points remain for this class."
                : "Standard membership refunds require at least two thirds of the term remaining and refundable paid value. Eligibility is based on elapsed calendar days, not gym visits.");
        var subject = isClass ? "class enrollment" : "membership";
        var reason = actorUserId == invoice.MemberId
            ? $"Member cancelled {subject}."
            : $"Staff cancelled {subject} on behalf of the member.";
        var adjustmentId = Guid.NewGuid();
        var wallet = await wallets.EarnAsync(new WalletOperation(invoice.MemberId, points,
            "PaymentAdjustment", adjustmentId, actorUserId, reason, item.ItemId), cancellationToken);
        var adjustment = new PaymentAdjustment
        {
            AdjustmentId = adjustmentId, InvoiceId = invoice.InvoiceId, InvoiceItemId = invoiceItemId,
            Type = PaymentAdjustmentType.Refund, Amount = 0, RequestedAmount = 0, Reason = reason,
            Status = PaymentAdjustmentStatus.Completed, RequestedByUserId = actorUserId, CreatedAt = now,
            SystemCalculatedPoints = points, ApprovedPoints = points, ApprovedByUserId = actorUserId,
            ApprovedAtUtc = now, CompletedAtUtc = now, ResolvedAt = now,
            PointLedgerEntryId = wallet.LedgerEntryId
        };
        db.Set<PaymentAdjustment>().Add(adjustment);
        if (isClass)
            await classes.CancelAsync(item.ItemId, EnrollmentEndReason.Refunded, cancellationToken);
        else
            await memberships.CancelAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, reason, actorUserId, cancellationToken);
        await notices.QueueAsync(invoice.MemberId, SportHub.BuildingBlocks.Abstractions.Notifications.NotificationEvents.RefundCompleted,
            adjustment.AdjustmentId, $"Refunded {points} points for cancelled {subject}, invoice {invoice.InvoiceNumber}.", cancellationToken);
        audit.Write(new AuditEntry(actorUserId, isClass ? "CANCEL_CLASS_ENROLLMENT" : "CANCEL_MEMBERSHIP", nameof(PaymentAdjustment),
            adjustment.AdjustmentId.ToString(), NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                invoiceItemId, points, ledgerEntryId = wallet.LedgerEntryId
            }), Reason: reason));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await GetOneAsync(adjustment.AdjustmentId, cancellationToken);
    }

    public async Task<RefundApprovalQuote> ApprovalQuoteAsync(Guid adjustmentId, bool centerFault,
        Guid managerUserId, CancellationToken ct)
    {
        var adjustment = await db.Set<PaymentAdjustment>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.AdjustmentId == adjustmentId, ct)
            ?? throw new NotFoundException("adjustment_not_found", "Refund request not found.");
        if (adjustment.Type != PaymentAdjustmentType.Refund || adjustment.InvoiceItemId is null)
            throw new ConflictException("legacy_refund_not_supported", "Legacy refund not supported.");
        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
            throw new ConflictException("refund_already_resolved", "Refund already resolved.");
        if (adjustment.RequestedByUserId == managerUserId)
            throw new ForbiddenException("cannot_approve_own_request", "Cannot approve own request.");
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(x => x.InvoiceId == adjustment.InvoiceId, ct);
        if (!InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Refund invoice not paid.");
        var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == adjustment.InvoiceItemId, ct);
        await EnsureNotDayPassAsync(item, ct);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, ct);
        var paid = await GetRemainingItemPaidVndAsync(invoice, item, ct);
        var requestDate = DateOnly.FromDateTime(VietnamTime.ToLocal(adjustment.CreatedAt));
        var points = await CalculatePointsAsync(item, paid, requestDate, centerFault, ct, adjustment.CreatedAt);
        // Use the same whole-point rounding as approval, including small paid amounts.
        var maxPercent = Enumerable.Range(0, 101).Last(p => RefundCalculator.PointsForRatio(paid, p) <= points);
        return new RefundApprovalQuote(points, paid, maxPercent, centerFault);
    }

    public async Task<PaymentAdjustmentResponse> ApproveAsync(Guid adjustmentId,
        ApprovePointRefundRequest request, Guid managerUserId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("refund_approval_reason_required", "Refund approval reason required.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var adjustment = await LockAdjustmentAsync(adjustmentId, cancellationToken);
        if (adjustment.Type != PaymentAdjustmentType.Refund || adjustment.InvoiceItemId is null)
            throw new ConflictException("legacy_refund_not_supported", "Legacy refund not supported.");
        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
            throw new ConflictException("refund_already_resolved", "Refund already resolved.");
        if (adjustment.RequestedByUserId == managerUserId)
            throw new ForbiddenException("cannot_approve_own_request", "Cannot approve own request.");

        var invoice = await db.Set<Invoice>().SingleAsync(x => x.InvoiceId == adjustment.InvoiceId, cancellationToken);
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Refund invoice not paid.");
        var item = await db.Set<InvoiceItem>().FromSqlInterpolated($"""
            SELECT * FROM invoice_items WHERE item_id = {adjustment.InvoiceItemId.Value} FOR UPDATE
            """).SingleAsync(cancellationToken);
        await EnsureNotDayPassAsync(item, cancellationToken);
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, cancellationToken);

        var requestDate = DateOnly.FromDateTime(VietnamTime.ToLocal(adjustment.CreatedAt));
        var itemPaidVnd = await GetRemainingItemPaidVndAsync(invoice, item, cancellationToken);
        var allowedByRule = await CalculatePointsAsync(item, itemPaidVnd, requestDate,
            request.CenterFault, cancellationToken, adjustment.CreatedAt);
        var absoluteCap = checked((int)decimal.Floor(itemPaidVnd / RefundCalculator.VndPerPoint));
        var points = allowedByRule;
        if (request.Percent is int percent)
        {
            if (request.Reason.Trim().Length < 10)
                throw new BadRequestException("refund_percent_reason_required", "Refund percent reason required.");
            points = RefundCalculator.PointsForRatio(itemPaidVnd, percent);
        }
        if (points <= 0)
            throw new ConflictException("refund_points_zero", "Refund points zero.");
        if (points > allowedByRule)
            throw new ConflictException("refund_exceeds_system_limit",
                $"Refund points exceed the system-calculated limit of {allowedByRule} for this service.");
        if (points > absoluteCap)
            throw new ConflictException("refund_exceeds_item_paid", $"Refund points exceed the remaining limit of {absoluteCap} for this invoice item.");
        if (request.CenterFault && request.Reason.Trim().Length < 10)
            throw new BadRequestException("center_fault_reason_required", "Center fault reason required.");

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
        await notices.QueueAsync(invoice.MemberId, SportHub.BuildingBlocks.Abstractions.Notifications.NotificationEvents.RefundCompleted,
            adjustment.AdjustmentId, $"Refunded {points} points for invoice {invoice.InvoiceNumber}.", cancellationToken);
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
            throw new BadRequestException("refund_rejection_reason_required", "Refund rejection reason required.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var adjustment = await LockAdjustmentAsync(adjustmentId, cancellationToken);
        if (adjustment.Type != PaymentAdjustmentType.Refund || adjustment.InvoiceItemId is null)
            throw new ConflictException("legacy_refund_not_supported", "Legacy refund not supported.");
        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
            throw new ConflictException("refund_already_resolved", "Refund already resolved.");
        if (adjustment.RequestedByUserId == managerUserId)
            throw new ForbiddenException("cannot_approve_own_request", "Cannot approve own request.");
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
                var facts = await memberships.GetFactsAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
                if (facts.PackageId == DayPass.PackageId) return 0;
                if (!facts.IsActive) return 0;
                return RefundCalculator.MembershipPoints(paidVnd, facts.StartDate, facts.EndDate,
                    requestDate, centerFault);
            }
            case InvoiceItemType.ClassPackage:
            {
                var facts = await classes.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
                if (!facts.EnrollmentActive && !centerFault) return 0;
                var requestedAt = DateTime.SpecifyKind(requestedAtUtc ?? clock.UtcNow, DateTimeKind.Utc);
                return RefundCalculator.ClassPoints(paidVnd, facts.TotalProvidedSessions,
                    facts.SessionsNotProvided, facts.FirstSessionUtc - requestedAt, centerFault);
            }
            case InvoiceItemType.Rental:
            {
                var facts = await rentals.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
                var instantUtc = DateTime.SpecifyKind(requestedAtUtc ?? clock.UtcNow, DateTimeKind.Utc);
                var requestAtVietnam = new DateTimeOffset(instantUtc, TimeSpan.Zero).ToOffset(VietnamTime.Offset);
                var freeCancelHours = await settings.GetIntAsync(SystemSettingKeys.RentalCancelFreeHours, ct);
                return RefundCalculator.RentalPoints(paidVnd, requestAtVietnam,
                    facts.StartUtc.ToOffset(VietnamTime.Offset), centerFault || facts.IsCancelledByCenter, freeCancelHours);
            }
            default:
                throw new ConflictException("refund_item_type_unsupported", "Refund item type unsupported.");
        }
    }

    private async Task EnsureNotDayPassAsync(InvoiceItem item, CancellationToken ct)
    {
        if (item.ItemType != InvoiceItemType.Membership) return;
        var facts = await memberships.GetFactsAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, ct);
        if (facts?.PackageId == DayPass.PackageId)
            throw new ConflictException("day_pass_non_refundable", "Gym day passes cannot be refunded as points.");
    }

    private async Task CancelEntitlementAsync(InvoiceItem item, string reason, bool centerFault, Guid actorId, CancellationToken ct)
    {
        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
                await memberships.CancelAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, reason, actorId, ct);
                break;
            case InvoiceItemType.ClassPackage:
                await classes.CancelAsync(item.ItemId, EnrollmentEndReason.Refunded, ct);
                break;
            case InvoiceItemType.Rental:
                if ((item.CourtRentalId ?? item.RelatedEntityId) is not Guid rentalId)
                    throw new ConflictException("refund_entitlement_not_found", "Refund entitlement not found.");
                await rentals.CancelAsync(rentalId, reason, centerFault, cancellationToken: ct);
                break;
        }
    }

    private async Task<decimal> GetRemainingItemPaidVndAsync(Invoice invoice, InvoiceItem item, CancellationToken ct)
    {
        var totalItemValue = await db.Set<InvoiceItem>().Where(x => x.InvoiceId == invoice.InvoiceId)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        if (totalItemValue <= 0 || item.LineAmount <= 0)
            throw new ConflictException("refund_item_value_invalid", "Refund item value invalid.");
        var cash = await db.Set<Domain.Entities.Payment>().Where(x => x.InvoiceId == invoice.InvoiceId
                && x.Status == PaymentStatus.Success).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var points = invoice.CheckoutCycleId is not null && SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia)
            ? invoice.PointsApplied * (decimal)RefundCalculator.VndPerPoint : 0m;
        var paidShare = Math.Min(item.LineAmount,
            decimal.Floor((cash + points) * item.LineAmount / totalItemValue));
        var paidTransferDifferences = await db.Set<InvoiceItem>().Where(x => x.SourceInvoiceItemId == item.ItemId
                && (x.Invoice!.Status == InvoiceStatus.Paid || (x.Invoice.Status == InvoiceStatus.PaidAfterReconciliation && x.Invoice.PaidVia == "VnPayAfterReconciliation")))
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
                "Legacy refund needs reconciliation.");
    }

    private async Task<PaymentAdjustment> LockAdjustmentAsync(Guid adjustmentId, CancellationToken ct)
    {
        var invoiceId = await db.Set<PaymentAdjustment>().AsNoTracking().Where(x => x.AdjustmentId == adjustmentId)
            .Select(x => (Guid?)x.InvoiceId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("refund_not_found", "Refund not found.");
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
