using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Api;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.BankRefunds;

/// <summary>
/// Hoàn tiền về tài khoản ngân hàng qua Support Request PAYMENT (BR mới, xem docs/Bank-Refund-Workflow.md).
///
/// Vòng đời: PENDING → APPROVED_AWAITING_PAYOUT → PAID (hoặc PENDING → REJECTED). Hệ thống không gọi ngân hàng: Manager
/// chuyển khoản ngoài hệ thống rồi ghi nhận số tiền + chứng từ. Duyệt là điểm khóa: quyền lợi bị hủy và giá trị được giữ chỗ
/// trong trần lũy kế của item (<see cref="RefundValue"/>), nên điểm và tiền không thể cùng nhận một giá trị.
/// </summary>
public sealed class BankRefundService(
    ISportHubDbContext db,
    IMembershipRefundFulfillment memberships,
    IClassEnrollmentFulfillment classes,
    ICourtRentalFulfillment rentals,
    ISystemSettingProvider settings,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock,
    IConfiguration configuration,
    IDataProtectionProvider dataProtection) : IBankRefundIntake
{
    // The account number is stored encrypted (authenticated) and only decrypted for the owner and the manager.
    private IDataProtector Protector => dataProtection.CreateProtector("SportHub.BankRefund.AccountNumber.v1");
    private string Reveal(string stored) => Protector.Unprotect(stored);

    public const string Disclaimer =
        "This amount is a policy suggestion, not an automatic decision. The manager decides the final amount after review.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // ------------------------------------------------------------------ Chọn giao dịch

    /// <summary>Các giao dịch (đã thanh toán, thuộc loại hỗ trợ) của Member kèm lý do nếu chưa thể yêu cầu hoàn tiền.</summary>
    public async Task<IReadOnlyList<BankRefundItemRow>> ListRefundableItemsAsync(Guid memberId, CancellationToken ct)
    {
        var rows = await db.Set<InvoiceItem>().AsNoTracking()
            .Where(i => i.Invoice!.MemberId == memberId
                && (i.ItemType == InvoiceItemType.Membership || i.ItemType == InvoiceItemType.ClassPackage
                    || i.ItemType == InvoiceItemType.Rental)
                && (i.Invoice.Status == InvoiceStatus.Paid
                    || (i.Invoice.Status == InvoiceStatus.PaidAfterReconciliation && i.Invoice.PaidVia == "VnPayAfterReconciliation")))
            .OrderByDescending(i => i.Invoice!.PaidAtUtc ?? i.Invoice.IssuedAt)
            .Take(40)
            .Select(i => new { Item = i, i.Invoice!.InvoiceNumber, PaidAt = i.Invoice.PaidAtUtc, Invoice = i.Invoice })
            .ToListAsync(ct);
        var result = new List<BankRefundItemRow>(rows.Count);
        foreach (var row in rows)
        {
            decimal remaining = 0m;
            string? reason = null;
            try
            {
                reason = await IneligibleReasonAsync(row.Item, row.Invoice, null, ct);
                remaining = await RefundValue.RemainingAsync(db, row.Invoice, row.Item, null, ct);
                if (reason is null && remaining <= 0) reason = "Nothing is left to refund for this item.";
            }
            catch (AppException ex)
            {
                reason = ex.Message;
            }
            result.Add(new BankRefundItemRow(row.Item.ItemId, row.Item.ItemType.ToString(), row.Item.Description,
                row.InvoiceNumber, row.PaidAt, row.Item.LineAmount, remaining, reason is null, reason));
        }
        return result;
    }

    // ------------------------------------------------------------------ Tạo (IBankRefundIntake)

    public async Task AttachAsync(BankRefundIntake intake, CancellationToken ct = default)
    {
        var item = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == intake.InvoiceItemId, ct)
            ?? throw new NotFoundException("invoice_item_not_found", "Transaction not found.");
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(x => x.InvoiceId == item.InvoiceId, ct);
        // The member the ticket is for must own the transaction, whoever typed the ticket in.
        if (invoice.MemberId != intake.MemberId)
            throw new ForbiddenException("bank_refund_item_not_owned", "This transaction does not belong to the member.");
        var reason = await IneligibleReasonAsync(item, invoice, null, ct);
        if (reason is not null)
            throw new ConflictException("bank_refund_not_eligible", reason);

        var now = clock.UtcNow;
        var (service, policy) = await EvaluateAsync(invoice, item, now, now, null, ct);
        if (service.RemainingRefundableVnd <= 0)
            throw new ConflictException("bank_refund_nothing_left", "Nothing is left to refund for this item.");

        var entity = new BankRefundRequest
        {
            BankRefundId = Guid.NewGuid(),
            SupportRequestId = intake.SupportRequestId,
            MemberId = intake.MemberId,
            InvoiceId = invoice.InvoiceId,
            InvoiceItemId = item.ItemId,
            ItemType = item.ItemType.ToString(),
            Status = BankRefundStatuses.Pending,
            BankName = intake.BankName,
            AccountNumber = Protector.Protect(intake.AccountNumber),
            AccountHolder = intake.AccountHolder,
            RequestedByUserId = intake.ActorUserId,
            CreatedAt = now,
            UpdatedAt = now,
            SuggestedAmount = policy.SuggestedVnd,
            PolicyPercent = policy.Percent,
            RequestSnapshotJson = JsonSerializer.Serialize(new BankRefundSnapshot(service, policy), Json)
        };
        db.Set<BankRefundRequest>().Add(entity);
        audit.Write(new AuditEntry(intake.ActorUserId, "REQUEST_BANK_REFUND", nameof(BankRefundRequest),
            entity.BankRefundId.ToString(), NewValue: JsonSerializer.Serialize(new
            {
                intake.SupportRequestId, intake.MemberId, invoiceItemId = item.ItemId, itemType = entity.ItemType,
                suggested = policy.SuggestedVnd, remaining = service.RemainingRefundableVnd
            })));
    }

    // ------------------------------------------------------------------ Đọc

    public Task<BankRefundView> GetForMemberAsync(Guid supportRequestId, Guid memberId, CancellationToken ct)
        => ViewAsync(supportRequestId, memberId, maskAccount: false, ct);

    public Task<BankRefundView> GetForStaffAsync(Guid supportRequestId, bool isManager, CancellationToken ct)
        => ViewAsync(supportRequestId, null, maskAccount: !isManager, ct);

    public async Task<IReadOnlyList<BankRefundListRow>> ListAsync(string? status, bool needsReconciliation, int take,
        CancellationToken ct)
    {
        var query = db.Set<BankRefundRequest>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            var value = status.Trim().ToUpperInvariant();
            if (value is not (BankRefundStatuses.Pending or BankRefundStatuses.ApprovedAwaitingPayout
                or BankRefundStatuses.Paid or BankRefundStatuses.Rejected))
                throw new BadRequestException("bank_refund_status_invalid", "Invalid bank refund status.");
            query = query.Where(x => x.Status == value);
        }
        if (needsReconciliation) query = query.Where(x => x.NeedsReconciliation);
        var rows = await query.OrderByDescending(x => x.CreatedAt).Take(Math.Clamp(take, 1, 200))
            .Select(x => new
            {
                x.BankRefundId, x.SupportRequestId, x.Status, x.ItemType, x.SuggestedAmount, x.ApprovedAmount,
                x.PayoutAmount, x.NeedsReconciliation, x.CreatedAt, x.InvoiceItemId, x.MemberId,
                TicketStatus = db.Set<MemberSupportRequest>().Where(t => t.RequestId == x.SupportRequestId)
                    .Select(t => t.Status).FirstOrDefault(),
                Description = db.Set<InvoiceItem>().Where(i => i.ItemId == x.InvoiceItemId)
                    .Select(i => i.Description).FirstOrDefault(),
                MemberName = db.Set<UserAccount>().Where(u => u.UserId == x.MemberId)
                    .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault()
            }).ToListAsync(ct);
        return rows.Select(x => new BankRefundListRow(x.BankRefundId, x.SupportRequestId, x.Status,
            x.TicketStatus ?? string.Empty, x.MemberName, x.ItemType, x.Description ?? string.Empty,
            x.SuggestedAmount, x.ApprovedAmount, x.PayoutAmount, x.NeedsReconciliation, x.CreatedAt)).ToList();
    }

    private async Task<BankRefundView> ViewAsync(Guid supportRequestId, Guid? onlyForMember, bool maskAccount,
        CancellationToken ct)
    {
        var refund = await db.Set<BankRefundRequest>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.SupportRequestId == supportRequestId, ct);
        if (refund is null || (onlyForMember is not null && refund.MemberId != onlyForMember))
            throw new NotFoundException("bank_refund_not_found", "Bank refund request not found.");
        var ticket = await db.Set<MemberSupportRequest>().AsNoTracking().SingleAsync(x => x.RequestId == supportRequestId, ct);

        var frozenJson = refund.Status is BankRefundStatuses.Paid or BankRefundStatuses.Rejected
            ? refund.ApprovalSnapshotJson ?? refund.RequestSnapshotJson
            : refund.Status == BankRefundStatuses.ApprovedAwaitingPayout ? refund.ApprovalSnapshotJson : null;
        BankRefundSnapshot snapshot;
        var frozen = frozenJson is not null;
        if (frozenJson is not null)
            snapshot = JsonSerializer.Deserialize<BankRefundSnapshot>(frozenJson, Json)!;
        else
        {
            var stored = JsonSerializer.Deserialize<BankRefundSnapshot>(refund.RequestSnapshotJson, Json)!;
            try
            {
                var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == refund.InvoiceItemId, ct);
                var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(x => x.InvoiceId == refund.InvoiceId, ct);
                var (service, policy) = await EvaluateAsync(invoice, item, refund.CreatedAt, clock.UtcNow, refund.BankRefundId, ct);
                snapshot = new BankRefundSnapshot(service, policy);
            }
            catch (AppException)
            {
                // The entitlement changed under the request (for example the member cancelled for points): show the
                // request-time figures and say so rather than failing the whole page.
                var notes = stored.Service.Notes.Append("The service can no longer be read live; figures are from request time.").ToList();
                snapshot = stored with { Service = stored.Service with { Notes = notes } };
                frozen = true;
            }
        }

        var names = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => u.UserId == refund.MemberId || u.UserId == refund.ApprovedByUserId || u.UserId == refund.PaidByUserId)
            .Select(u => new { u.UserId, Name = u.Profile != null ? u.Profile.FullName : u.Email })
            .ToDictionaryAsync(x => x.UserId, x => x.Name, ct);
        var account = new BankAccountView(refund.BankName,
            maskAccount ? Mask(Reveal(refund.AccountNumber)) : Reveal(refund.AccountNumber), refund.AccountHolder, maskAccount);
        BankPayoutView? payout = refund.Status == BankRefundStatuses.Paid
            ? new BankPayoutView(refund.PayoutAmount!.Value, refund.PayoutAt!.Value, refund.PayoutReference,
                refund.PayoutNote ?? string.Empty,
                refund.PaidByUserId is Guid p ? names.GetValueOrDefault(p) : null, refund.PaidRecordedAtUtc!.Value)
            : null;
        return new BankRefundView(refund.BankRefundId, refund.SupportRequestId, refund.Status, ticket.Status,
            refund.MemberId, names.GetValueOrDefault(refund.MemberId), account, snapshot.Service, snapshot.Policy,
            refund.ApprovedAmount, refund.CenterFault, refund.ApprovalReason, refund.ApprovedAtUtc,
            refund.ApprovedByUserId is Guid a ? names.GetValueOrDefault(a) : null, payout, refund.NeedsReconciliation,
            refund.ReconciliationNote, refund.RejectionReason, refund.RejectedAtUtc, refund.CreatedAt, frozen);
    }

    // ------------------------------------------------------------------ Duyệt

    public async Task<BankRefundView> ApproveAsync(Guid supportRequestId, Guid managerId,
        ApproveBankRefundRequest request, CancellationToken ct)
    {
        var amount = request.Amount;
        if (amount <= 0 || amount != decimal.Truncate(amount))
            throw new BadRequestException("bank_refund_amount_invalid", "Enter a whole amount of VND greater than zero.");
        var reason = request.Reason.Trim();
        if (reason.Length < 3)
            throw new BadRequestException("bank_refund_reason_required", "A reason is required.");
        if (request.CenterFault && reason.Length < 10)
            throw new BadRequestException("center_fault_reason_required", "Describe the center fault in at least 10 characters.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (ticket, refund) = await LockAsync(supportRequestId, ct);
        if (refund.Status is not (BankRefundStatuses.Pending or BankRefundStatuses.ApprovedAwaitingPayout))
            throw new ConflictException("bank_refund_already_resolved", "This refund request has already been finalized.");
        var firstApproval = refund.Status == BankRefundStatuses.Pending;

        // Same lock order as the point-refund flows (invoice, then item) so concurrent point/bank refunds serialize.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM invoices WHERE invoice_id = {refund.InvoiceId} FOR UPDATE", ct);
        var item = await db.Set<InvoiceItem>().FromSqlInterpolated(
            $"SELECT * FROM invoice_items WHERE item_id = {refund.InvoiceItemId} FOR UPDATE").SingleAsync(ct);
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(x => x.InvoiceId == item.InvoiceId, ct);
        if (!InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "The invoice is not paid.");
        await EnsureNoUnmappedLegacyRefundAsync(invoice.InvoiceId, ct);
        if (firstApproval)
        {
            // Another path may have settled this item for points since the request was filed.
            await RefundValue.EnsureNoCommittedBankRefundAsync(db, item.ItemId, ct, refund.BankRefundId);
        }

        RefundServiceSnapshot service;
        RefundPolicySnapshot policy;
        string snapshotJson;
        if (firstApproval)
        {
            (service, policy) = await EvaluateAsync(invoice, item, refund.CreatedAt, clock.UtcNow, refund.BankRefundId, ct);
            snapshotJson = JsonSerializer.Serialize(new BankRefundSnapshot(service, policy), Json);
        }
        else
        {
            // Adjusting before the transfer: the benefit already ended, so it can no longer be read live. Keep the
            // approval-time snapshot and only recheck the remaining value against the cumulative cap.
            snapshotJson = refund.ApprovalSnapshotJson ?? refund.RequestSnapshotJson;
            var frozen = JsonSerializer.Deserialize<BankRefundSnapshot>(snapshotJson, Json)!;
            var remainingNow = await RefundValue.RemainingAsync(db, invoice, item, refund.BankRefundId, ct);
            service = frozen.Service with { RemainingRefundableVnd = remainingNow };
            policy = frozen.Policy;
        }
        if (service.RemainingRefundableVnd <= 0)
            throw new ConflictException("bank_refund_nothing_left", "Nothing is left to refund for this item.");
        if (amount > service.RemainingRefundableVnd)
            throw new ConflictException("refund_exceeds_item_paid",
                $"The amount exceeds the remaining refundable value of {service.RemainingRefundableVnd:N0} VND for this item.");
        var suggested = request.CenterFault ? policy.CenterFaultSuggestedVnd : policy.SuggestedVnd;
        if (amount != suggested && reason.Length < 10)
            throw new BadRequestException("bank_refund_deviation_reason_required",
                "The amount differs from the policy suggestion; explain why in at least 10 characters.");

        var now = clock.UtcNow;
        if (firstApproval)
        {
            // Approval is the point of no return: the benefit ends now so it cannot be used while the transfer is pending.
            await CancelEntitlementAsync(item, reason, request.CenterFault, managerId, ct);
        }
        var previousAmount = refund.ApprovedAmount;
        refund.Status = BankRefundStatuses.ApprovedAwaitingPayout;
        refund.ApprovedAmount = amount;
        refund.CenterFault = request.CenterFault;
        refund.ApprovalReason = reason;
        refund.ApprovedByUserId = managerId;
        refund.ApprovedAtUtc = now;
        refund.ApprovalSnapshotJson = snapshotJson;
        refund.UpdatedAt = now;

        ticket.Status = "APPROVED_AWAITING_PAYOUT";
        ticket.ProgressNote = reason;
        ticket.UpdatedAt = now;
        ticket.AssignedToUserId ??= managerId;
        AddEvent(ticket.RequestId, managerId, "REFUND_APPROVED",
            $"Approved {amount:N0} VND (suggested {suggested:N0} VND). {reason}", now);
        audit.Write(new AuditEntry(managerId, "APPROVE_BANK_REFUND", nameof(BankRefundRequest),
            refund.BankRefundId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = firstApproval ? BankRefundStatuses.Pending : BankRefundStatuses.ApprovedAwaitingPayout, amount = previousAmount }),
            NewValue: JsonSerializer.Serialize(new
            {
                status = refund.Status, amount, suggested, remaining = service.RemainingRefundableVnd,
                centerFault = request.CenterFault, invoiceItemId = item.ItemId
            }), Reason: reason));
        if (firstApproval)
            notifications.Queue(new NotificationRequest(refund.MemberId, NotificationEvents.BankRefundApproved,
                $"Your refund request for {item.Description} was approved for {amount:N0} VND. "
                + "We will transfer it to the account you provided and notify you when it is done.",
                refund.BankRefundId));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ViewAsync(supportRequestId, null, maskAccount: false, ct);
    }

    // ------------------------------------------------------------------ Từ chối

    public async Task<BankRefundView> RejectAsync(Guid supportRequestId, Guid managerId, string reasonText, CancellationToken ct)
    {
        var reason = reasonText?.Trim() ?? string.Empty;
        if (reason.Length is < 3 or > 500)
            throw new BadRequestException("bank_refund_reason_required", "A rejection reason of 3 to 500 characters is required.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (ticket, refund) = await LockAsync(supportRequestId, ct);
        if (refund.Status == BankRefundStatuses.ApprovedAwaitingPayout)
            throw new ConflictException("bank_refund_already_approved",
                "An approved refund cannot be rejected: the benefit has already ended. Record the transfer, or adjust the approved amount.");
        if (refund.Status != BankRefundStatuses.Pending)
            throw new ConflictException("bank_refund_already_resolved", "This refund request has already been finalized.");
        var now = clock.UtcNow;
        refund.Status = BankRefundStatuses.Rejected;
        refund.RejectionReason = reason;
        refund.RejectedByUserId = managerId;
        refund.RejectedAtUtc = now;
        refund.UpdatedAt = now;
        ticket.Status = "REJECTED";
        ticket.ProgressNote = reason;
        ticket.AssignedToUserId ??= managerId;
        ticket.ClosedAt = ticket.UpdatedAt = now;
        AddEvent(ticket.RequestId, managerId, "REJECTED", reason, now);
        audit.Write(new AuditEntry(managerId, "REJECT_BANK_REFUND", nameof(BankRefundRequest),
            refund.BankRefundId.ToString(), OldValue: "{\"status\":\"PENDING\"}", NewValue: "{\"status\":\"REJECTED\"}",
            Reason: reason));
        notifications.Queue(new NotificationRequest(refund.MemberId, NotificationEvents.BankRefundRejected,
            $"Your refund request (ref {Reference(ticket.RequestId)}) was not approved. Reason: {reason}", refund.BankRefundId));
        await QueueEmailAsync(refund.MemberId, NotificationEvents.BankRefundRejected, refund.BankRefundId,
            $"SportHub - Your refund request ({Reference(ticket.RequestId)})",
            name => EmailContent.Paragraph($"Hi {name}, we reviewed your refund request and could not approve it.")
                + EmailContent.Details(("Reference", Reference(ticket.RequestId)), ("Reason", reason))
                + SignInLink(ticket.RequestId), ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ViewAsync(supportRequestId, null, maskAccount: false, ct);
    }

    // ------------------------------------------------------------------ Báo đối soát

    /// <summary>
    /// Manager đã chuyển tiền nhưng chưa ghi nhận được (lỗi mạng/DB/ảnh). Đánh dấu để vận hành đối soát sao kê; hệ thống không bao giờ
    /// tự chuyển tiền nên retry ghi nhận không thể chuyển lại. Cờ chỉ được xóa khi ghi nhận hoàn tất.
    /// </summary>
    public async Task<BankRefundView> FlagPayoutAsync(Guid supportRequestId, Guid managerId, string note, CancellationToken ct)
    {
        var text = note?.Trim() ?? string.Empty;
        if (text.Length is < 10 or > 500)
            throw new BadRequestException("bank_refund_flag_note_required", "Describe what happened in 10 to 500 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (ticket, refund) = await LockAsync(supportRequestId, ct);
        if (refund.Status != BankRefundStatuses.ApprovedAwaitingPayout)
            throw new ConflictException("bank_refund_not_awaiting_payout", "Only a refund awaiting payout can be flagged.");
        var now = clock.UtcNow;
        refund.NeedsReconciliation = true;
        refund.ReconciliationNote = text;
        refund.ReconciliationFlaggedAtUtc = now;
        refund.UpdatedAt = now;
        ticket.UpdatedAt = now;
        AddEvent(ticket.RequestId, managerId, "PAYOUT_FLAGGED", text, now);
        audit.Write(new AuditEntry(managerId, "FLAG_BANK_REFUND_RECONCILIATION", nameof(BankRefundRequest),
            refund.BankRefundId.ToString(), NewValue: "{\"needsReconciliation\":true}", Reason: text));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ViewAsync(supportRequestId, null, maskAccount: false, ct);
    }

    // ------------------------------------------------------------------ Ghi nhận đã chuyển khoản → DONE

    public async Task<BankRefundView> CompleteAsync(Guid supportRequestId, Guid managerId,
        CompleteBankRefundRequest request, CancellationToken ct)
    {
        var note = request.Note?.Trim() ?? string.Empty;
        if (note.Length is < 10 or > 500)
            throw new BadRequestException("bank_refund_note_required",
                "Explain the reason for the refund in 10 to 500 characters.");
        if (request.PayoutAmount <= 0 || request.PayoutAmount != decimal.Truncate(request.PayoutAmount))
            throw new BadRequestException("bank_refund_amount_invalid", "Enter the whole amount of VND that was transferred.");
        var reference = string.IsNullOrWhiteSpace(request.BankReference) ? null : request.BankReference.Trim();
        var transferredAt = request.TransferredAt.UtcDateTime;
        var now = clock.UtcNow;
        if (transferredAt > now.AddMinutes(5))
            throw new BadRequestException("bank_refund_transfer_time_future", "The transfer time cannot be in the future.");
        var proofs = await SupportImageUploads.ReadAsync(request.Files, SupportAttachmentKinds.PayoutProof, managerId,
            now, required: true, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (ticket, refund) = await LockAsync(supportRequestId, ct);
        if (refund.Status == BankRefundStatuses.Paid)
        {
            // A retry of the same submission is answered with the stored result; anything else is a second completion.
            await tx.RollbackAsync(ct);
            if (refund.CompletionKey == request.CompletionKey)
                return await ViewAsync(supportRequestId, null, maskAccount: false, ct);
            throw new ConflictException("bank_refund_already_paid", "This refund has already been completed.");
        }
        if (refund.Status != BankRefundStatuses.ApprovedAwaitingPayout)
            throw new ConflictException("bank_refund_not_approved", "Approve the refund before recording the transfer.");
        if (request.PayoutAmount != refund.ApprovedAmount)
            throw new BadRequestException("bank_refund_payout_mismatch",
                $"The transferred amount must equal the approved amount of {refund.ApprovedAmount:N0} VND. Adjust the approval first if it changed.");
        if (transferredAt < refund.ApprovedAtUtc!.Value.AddMinutes(-1))
            throw new BadRequestException("bank_refund_transfer_time_before_approval",
                "The transfer cannot be earlier than the approval.");

        refund.Status = BankRefundStatuses.Paid;
        refund.PayoutAmount = request.PayoutAmount;
        refund.PayoutAt = transferredAt;
        refund.PayoutReference = reference;
        refund.PayoutNote = note;
        refund.PaidByUserId = managerId;
        refund.PaidRecordedAtUtc = now;
        refund.CompletionKey = request.CompletionKey;
        refund.NeedsReconciliation = false;
        refund.UpdatedAt = now;
        ticket.Status = "DONE";
        ticket.ProgressNote = note;
        ticket.ClosedAt = ticket.UpdatedAt = now;
        foreach (var proof in proofs) proof.RequestId = ticket.RequestId;
        db.Set<MemberSupportAttachment>().AddRange(proofs);
        AddEvent(ticket.RequestId, managerId, "DONE",
            $"Transferred {request.PayoutAmount:N0} VND{(reference is null ? string.Empty : $" (bank ref {reference})")}. {note}", now);
        audit.Write(new AuditEntry(managerId, "COMPLETE_BANK_REFUND", nameof(BankRefundRequest),
            refund.BankRefundId.ToString(), OldValue: "{\"status\":\"APPROVED_AWAITING_PAYOUT\"}",
            NewValue: JsonSerializer.Serialize(new
            {
                status = refund.Status, amount = request.PayoutAmount, transferredAt, reference, proofs = proofs.Count
            }), Reason: note));

        var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == refund.InvoiceItemId, ct);
        var invoiceNumber = await db.Set<Invoice>().AsNoTracking().Where(x => x.InvoiceId == refund.InvoiceId)
            .Select(x => x.InvoiceNumber).SingleAsync(ct);
        var typeLabel = TypeLabel(item.ItemType);
        var code = Reference(ticket.RequestId);
        // In-app and email are queued in this transaction (outbox) so a retry can never send them twice, and they
        // carry no full account number and no images: the receipt is only reachable after signing in.
        notifications.Queue(new NotificationRequest(refund.MemberId, NotificationEvents.RefundCompleted,
            $"We transferred your {typeLabel} refund of {request.PayoutAmount:N0} VND (ref {code}). Reason: {note} "
            + $"Sign in and open Help to view the transfer receipt: {SupportLinkPath(ticket.RequestId)}",
            refund.BankRefundId));
        await QueueEmailAsync(refund.MemberId, NotificationEvents.RefundCompleted, refund.BankRefundId,
            $"SportHub - Your refund has been transferred ({code})",
            name => EmailContent.Paragraph($"Hi {name}, your refund has been transferred to the bank account you provided.")
                + EmailContent.Details(
                    ("Service", $"{typeLabel}: {item.Description}"),
                    ("Invoice", invoiceNumber),
                    ("Refunded", $"{request.PayoutAmount:N0} VND"),
                    ("Reason", note),
                    ("Request code", code),
                    ("Account", $"{refund.BankName} {Mask(Reveal(refund.AccountNumber))}"))
                + EmailContent.Paragraph("For your security the transfer receipt is not attached. Sign in to view it:")
                + SignInLink(ticket.RequestId), ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ViewAsync(supportRequestId, null, maskAccount: false, ct);
    }

    // ------------------------------------------------------------------ Tính toán chung

    /// <summary>Lý do chưa thể yêu cầu hoàn tiền cho item (null = đủ điều kiện).</summary>
    private async Task<string?> IneligibleReasonAsync(InvoiceItem item, Invoice invoice, Guid? excludeRefundId, CancellationToken ct)
    {
        if (item.ItemType is not (InvoiceItemType.Membership or InvoiceItemType.ClassPackage or InvoiceItemType.Rental))
            return "This kind of transaction cannot be refunded to a bank account.";
        if (!InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            return "The invoice is not paid.";
        if (await db.Set<PaymentAdjustment>().AsNoTracking().AnyAsync(x => x.InvoiceId == invoice.InvoiceId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed
                && x.InvoiceItemId == null, ct))
            return "An older refund on this invoice must be reconciled by the manager first.";
        if (item.ItemType == InvoiceItemType.Membership)
        {
            var facts = await memberships.GetFactsAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, ct);
            if (facts is null) return "The membership for this item could not be found.";
            if (facts.PackageId == DayPass.PackageId) return "Gym day passes cannot be refunded.";
        }
        var active = await db.Set<BankRefundRequest>().AsNoTracking()
            .Where(x => x.InvoiceItemId == item.ItemId && x.BankRefundId != excludeRefundId
                && (x.Status == BankRefundStatuses.Pending || x.Status == BankRefundStatuses.ApprovedAwaitingPayout))
            .Select(x => x.Status).FirstOrDefaultAsync(ct);
        if (active is not null) return "A bank refund request for this item is already being processed.";
        return null;
    }

    private async Task EnsureNoUnmappedLegacyRefundAsync(Guid invoiceId, CancellationToken ct)
    {
        if (await db.Set<PaymentAdjustment>().AnyAsync(x => x.InvoiceId == invoiceId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed
                && x.InvoiceItemId == null, ct))
            throw new ConflictException("legacy_refund_needs_reconciliation", "Legacy refund needs reconciliation.");
    }

    /// <summary>
    /// Dựng snapshot dịch vụ + chính sách. Chính sách tính tại <paramref name="policyAtUtc"/> (lúc gửi yêu cầu, giống hoàn điểm
    /// nên thời gian chờ duyệt không làm Member bị thiệt); số buổi/ngày đã dùng tính tại <paramref name="usageAtUtc"/>.
    /// </summary>
    private async Task<(RefundServiceSnapshot, RefundPolicySnapshot)> EvaluateAsync(Invoice invoice, InvoiceItem item,
        DateTime policyAtUtc, DateTime usageAtUtc, Guid? excludeRefundId, CancellationToken ct)
    {
        var policyDate = DateOnly.FromDateTime(VietnamTime.ToLocal(policyAtUtc));
        var usageDate = DateOnly.FromDateTime(VietnamTime.ToLocal(usageAtUtc));
        var remaining = await RefundValue.RemainingAsync(db, invoice, item, excludeRefundId, ct);
        var shares = await RefundValue.PaidSharesAsync(db, invoice, item, null, ct);

        // What the policy applies to is the real refundable VND, never a figure rebuilt from rounded points.
        RefundPolicyQuote normal, fault;
        string status;
        DateOnly? startDate = null, endDate = null;
        DateTime? startUtc = null, endUtc = null;
        string? unit = null;
        int? total = null, used = null, unused = null;
        var notes = new List<string>();

        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
            {
                var facts = await memberships.GetFactsAsync(item.ItemId, item.MemberPackageId ?? item.RelatedEntityId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "The membership could not be found.");
                if (facts.PackageId == DayPass.PackageId)
                    throw new ConflictException("day_pass_non_refundable", "Gym day passes cannot be refunded.");
                status = facts.IsActive ? "Active" : "Not active";
                startDate = facts.StartDate;
                endDate = facts.EndDate;
                unit = "days";
                total = facts.EndDate.DayNumber - facts.StartDate.DayNumber + 1;
                used = Math.Clamp(usageDate.DayNumber - facts.StartDate.DayNumber + 1, 0, total.Value);
                unused = total - used;
                if (facts.HasLaterRenewal) notes.Add("The member has a renewal that starts after this term.");
                normal = facts.IsActive
                    ? RefundCalculator.MembershipVnd(remaining, facts.StartDate, facts.EndDate, policyDate)
                    : RefundPolicyQuote.None("The membership is no longer active.");
                fault = RefundCalculator.MembershipVnd(remaining, facts.StartDate, facts.EndDate, policyDate, true);
                break;
            }
            case InvoiceItemType.ClassPackage:
            {
                var facts = await classes.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "The class enrollment could not be found.");
                status = facts.EnrollmentActive ? "Enrolled" : "Not enrolled";
                startUtc = facts.FirstSessionUtc.UtcDateTime;
                unit = "sessions";
                total = facts.TotalProvidedSessions;
                unused = facts.SessionsNotProvided;
                used = facts.TotalProvidedSessions - facts.SessionsNotProvided;
                if (facts.FirstSessionUtc.UtcDateTime <= usageAtUtc)
                    notes.Add($"The first session has started; {used} of {total} sessions were delivered.");
                else
                    notes.Add($"The first session starts {VietnamTime.ToLocal(facts.FirstSessionUtc.UtcDateTime):yyyy-MM-dd HH:mm} (Vietnam time).");
                var until = facts.FirstSessionUtc - new DateTimeOffset(DateTime.SpecifyKind(policyAtUtc, DateTimeKind.Utc));
                normal = facts.EnrollmentActive
                    ? RefundCalculator.ClassVnd(remaining, facts.TotalProvidedSessions, facts.SessionsNotProvided, until)
                    : RefundPolicyQuote.None("The enrollment is no longer active.");
                fault = RefundCalculator.ClassVnd(remaining, facts.TotalProvidedSessions, facts.SessionsNotProvided, until, true);
                break;
            }
            case InvoiceItemType.Rental:
            {
                var facts = await rentals.GetRefundFactsAsync(item.ItemId, ct)
                    ?? throw new ConflictException("refund_entitlement_not_found", "The court rental could not be found.");
                status = facts.Status;
                startUtc = facts.StartUtc.UtcDateTime;
                endUtc = facts.EndUtc?.UtcDateTime;
                unit = "hours";
                if (facts.EndUtc is DateTimeOffset end)
                {
                    total = (int)Math.Ceiling((end - facts.StartUtc).TotalHours);
                    var elapsed = (usageAtUtc - facts.StartUtc.UtcDateTime).TotalHours;
                    used = (int)Math.Clamp(Math.Floor(elapsed), 0, total.Value);
                    unused = total - used;
                }
                if (facts.IsCancelledByCenter) notes.Add("The rental was cancelled by the center.");
                var freeHours = await settings.GetIntAsync(SystemSettingKeys.RentalCancelFreeHours, ct);
                var at = new DateTimeOffset(DateTime.SpecifyKind(policyAtUtc, DateTimeKind.Utc)).ToOffset(VietnamTime.Offset);
                var start = facts.StartUtc.ToOffset(VietnamTime.Offset);
                normal = RefundCalculator.RentalVnd(remaining, at, start, facts.IsCancelledByCenter, freeHours);
                fault = RefundCalculator.RentalVnd(remaining, at, start, true, freeHours);
                break;
            }
            default:
                throw new ConflictException("refund_item_type_unsupported", "This kind of transaction cannot be refunded to a bank account.");
        }

        var priorRefunds = await PriorRefundsAsync(item, excludeRefundId, ct);
        var priorBank = priorRefunds.Where(r => r.Kind == "BANK").Sum(r => r.AmountVnd);
        var priorPoint = priorRefunds.Where(r => r.Kind != "BANK").Sum(r => r.AmountVnd);
        var service = new RefundServiceSnapshot(item.ItemId, item.ItemType.ToString(), item.Description,
            invoice.InvoiceId, invoice.InvoiceNumber, invoice.PaidAtUtc, item.LineAmount, shares.Cash, shares.Points,
            shares.Total, priorPoint, priorBank, remaining, status, startDate, endDate, startUtc, endUtc, unit, total,
            used, unused, notes, priorRefunds);
        var policy = new RefundPolicySnapshot(normal.Percent, Math.Min(normal.Vnd, remaining), normal.Basis,
            fault.Percent, Math.Min(fault.Vnd, remaining), fault.Basis, policyAtUtc, Disclaimer);
        return (service, policy);
    }

    private async Task<IReadOnlyList<PriorRefundRow>> PriorRefundsAsync(InvoiceItem item, Guid? excludeRefundId, CancellationToken ct)
    {
        var rows = new List<PriorRefundRow>();
        var adjustments = await db.Set<PaymentAdjustment>().AsNoTracking()
            .Where(x => x.InvoiceItemId == item.ItemId && x.Type == PaymentAdjustmentType.Refund
                && x.Status == PaymentAdjustmentStatus.Completed)
            .Select(x => new { x.ApprovedPoints, x.Amount, At = x.CompletedAtUtc ?? x.CreatedAt }).ToListAsync(ct);
        rows.AddRange(adjustments.Select(x => x.ApprovedPoints > 0
            ? new PriorRefundRow("POINTS", "Completed", x.ApprovedPoints * (decimal)RefundCalculator.VndPerPoint, x.ApprovedPoints, x.At)
            : new PriorRefundRow("LEGACY_PAYOUT", "Completed", x.Amount, null, x.At)));
        var credits = await db.Set<PointLedgerEntry>().AsNoTracking()
            .Where(x => x.InvoiceItemId == item.ItemId && x.EntryType == PointEntryType.Earn
                && (x.ReferenceType == "SystemEvent" || x.ReferenceType == "ClassTransferDifference"))
            .Select(x => new { x.Points, x.ReferenceType, At = x.CreatedAtUtc }).ToListAsync(ct);
        rows.AddRange(credits.Select(x => new PriorRefundRow(
            x.ReferenceType == "SystemEvent" ? "POINTS_SYSTEM" : "POINTS_TRANSFER", "Completed",
            x.Points * (decimal)RefundCalculator.VndPerPoint, x.Points, x.At)));
        var bank = await db.Set<BankRefundRequest>().AsNoTracking()
            .Where(x => x.InvoiceItemId == item.ItemId && x.BankRefundId != excludeRefundId
                && (x.Status == BankRefundStatuses.ApprovedAwaitingPayout || x.Status == BankRefundStatuses.Paid))
            .Select(x => new { x.Status, Amount = x.PayoutAmount ?? x.ApprovedAmount ?? 0m, At = x.PayoutAt ?? x.ApprovedAtUtc ?? x.CreatedAt })
            .ToListAsync(ct);
        rows.AddRange(bank.Select(x => new PriorRefundRow("BANK", x.Status, x.Amount, null, x.At)));
        return rows.OrderBy(x => x.At).ToList();
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
                    throw new ConflictException("refund_entitlement_not_found", "The court rental could not be found.");
                await rentals.CancelAsync(rentalId, reason, centerFault, cancellationToken: ct);
                break;
        }
    }

    private async Task<(MemberSupportRequest Ticket, BankRefundRequest Refund)> LockAsync(Guid supportRequestId, CancellationToken ct)
    {
        var ticket = (await db.Set<MemberSupportRequest>().FromSqlInterpolated(
                $"SELECT * FROM member_support_requests WHERE request_id = {supportRequestId} FOR UPDATE")
            .ToListAsync(ct)).SingleOrDefault()
            ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
        var refund = (await db.Set<BankRefundRequest>().FromSqlInterpolated(
                $"SELECT * FROM bank_refund_requests WHERE support_request_id = {supportRequestId} FOR UPDATE")
            .ToListAsync(ct)).SingleOrDefault()
            ?? throw new NotFoundException("bank_refund_not_found", "Bank refund request not found.");
        return (ticket, refund);
    }

    private void AddEvent(Guid requestId, Guid actorId, string type, string? note, DateTime now)
        => db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = Guid.NewGuid(), RequestId = requestId, ActorUserId = actorId, Type = type,
            Note = string.IsNullOrWhiteSpace(note) ? null : (note.Length > 1000 ? note[..1000] : note), CreatedAt = now
        });

    private async Task QueueEmailAsync(Guid memberId, string eventType, Guid sourceId, string subject,
        Func<string, string> body, CancellationToken ct)
    {
        var recipient = await db.Set<UserAccount>().AsNoTracking().Where(x => x.UserId == memberId)
            .Select(x => new { x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .SingleOrDefaultAsync(ct);
        if (recipient is null) return;
        notifications.QueueEmail(new EmailNotificationRequest(memberId, recipient.Email, eventType, sourceId, subject,
            body(recipient.Name)));
    }

    private string FrontendBaseUrl()
    {
        var configured = configuration["Frontend:BaseUrl"];
        if (string.IsNullOrWhiteSpace(configured))
            configured = configuration.GetSection("Cors:AllowedOrigins").GetChildren().Select(x => x.Value)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
        return (string.IsNullOrWhiteSpace(configured) ? "http://localhost:3000" : configured).TrimEnd('/');
    }

    private static string SupportLinkPath(Guid requestId) => $"/member/help?ticket={requestId:D}";

    private string SignInLink(Guid requestId)
    {
        var url = FrontendBaseUrl() + SupportLinkPath(requestId);
        var encoded = System.Net.WebUtility.HtmlEncode(url);
        return $"<p style=\"margin:0 0 20px;\"><a href=\"{encoded}\">{encoded}</a></p>";
    }

    private static string Reference(Guid requestId) => requestId.ToString("N")[..8].ToUpperInvariant();

    public static string Mask(string accountNumber)
        => accountNumber.Length <= 4 ? new string('•', accountNumber.Length) : "••••" + accountNumber[^4..];

    private static string TypeLabel(InvoiceItemType type) => type switch
    {
        InvoiceItemType.Membership => "gym membership",
        InvoiceItemType.ClassPackage => "class",
        InvoiceItemType.Rental => "court rental",
        _ => "service"
    };
}
