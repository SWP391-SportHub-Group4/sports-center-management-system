using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

/// <summary>Mutations here belong to the caller's transaction; a failed benefit rolls back cash and points.</summary>
public sealed class PaymentFulfillmentService(ISportHubDbContext db, IPointWalletService wallets,
    IClassEnrollmentFulfillment classes, IPtPurchaseFulfillment pt, IPackageActivationService packages,
    IAuditWriter audit, IClock clock)
{
    public async Task CompletePointsAsync(Invoice invoice, CheckoutSession session, CancellationToken ct)
    {
        RequireTransaction();
        if (invoice.CashAmount != 0 || invoice.PointsApplied <= 0
            || invoice.Status != InvoiceStatus.Issued || session.State != "Active"
            || session.ExpiresAtUtc <= clock.UtcNow)
            throw new ConflictException("checkout_unavailable", "Checkout 100% điểm không còn hợp lệ.");
        await SpendAndFulfillAsync(invoice, session, "Points", ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task CompleteVerifiedAsync(Invoice invoice, CheckoutSession session,
        PaymentAttempt attempt, VerifiedGatewayEvent proof, CancellationToken ct,
        bool lateReacquired = false)
    {
        RequireTransaction();
        if (invoice.Status != InvoiceStatus.Issued || session.State != "Active"
            || session.ExpiresAtUtc <= clock.UtcNow
            || (!lateReacquired && attempt.CheckoutSessionId != session.CheckoutSessionId)
            || attempt.Amount != invoice.CashAmount || attempt.PointsSnapshot != invoice.PointsApplied)
            throw new ConflictException("checkout_reconciliation_required", "Giữ chỗ hoặc số tiền checkout đã thay đổi.");
        db.Set<Domain.Entities.Payment>().Add(new Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = proof.Amount,
            Method = PaymentMethod.VnPay, ReferenceCode = proof.ProviderTransactionId,
            Status = PaymentStatus.Success, ReceivedByUserId = invoice.IssuedByUserId,
            PaidAt = clock.UtcNow
        });
        attempt.Status = PaymentAttemptStatus.Succeeded;
        attempt.ProviderTransactionId = proof.ProviderTransactionId;
        attempt.VerifiedResult = "Paid";
        attempt.VerifiedAtUtc = proof.VerifiedAtUtc;
        await SpendAndFulfillAsync(invoice, session,
            lateReacquired ? "VnPayAfterReconciliation"
                : invoice.PointsApplied > 0 ? "VnPayAndPoints" : "VnPay", ct);
        proof.ProcessingStatus = "Fulfilled";
        proof.ProcessedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private async Task SpendAndFulfillAsync(Invoice invoice, CheckoutSession session,
        string paidVia, CancellationToken ct)
    {
        if (invoice.PointsApplied > 0)
            await wallets.SpendAsync(new WalletOperation(invoice.MemberId, invoice.PointsApplied,
                "CheckoutSession", session.CheckoutSessionId, invoice.IssuedByUserId), ct);
        var item = await db.Set<InvoiceItem>().SingleAsync(x => x.InvoiceId == invoice.InvoiceId, ct);
        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
                await packages.ActivateIfObligationMetAsync(invoice,
                    new InvoiceBalance(invoice.TotalAmount, invoice.TotalAmount, 0, 0),
                    invoice.IssuedByUserId, ct);
                break;
            case InvoiceItemType.ClassPackage:
                if (session.ResourceHoldId is not Guid holdId)
                    throw new ConflictException("checkout_hold_missing", "Checkout không có giữ chỗ.");
                await classes.ConfirmAsync(holdId, item.ItemId, ct);
                break;
            case InvoiceItemType.PT:
                if (item.RelatedEntityId is not Guid ptId)
                    throw new ConflictException("pt_entitlement_missing", "Checkout thiếu quyền lợi PT chờ thanh toán.");
                await pt.ActivateAsync(ptId, ct);
                break;
            default:
                throw new ConflictException("checkout_kind_unsupported", "Loại quyền lợi này chưa được hỗ trợ.");
        }
        invoice.Status = InvoiceStatus.Paid;
        invoice.PaidVia = paidVia;
        invoice.PaidAtUtc = clock.UtcNow;
        invoice.ReconciliationRequired = false;
        session.State = "Paid";
        audit.Write(new AuditEntry(invoice.IssuedByUserId, "FULFILL_CHECKOUT", nameof(Invoice),
            invoice.InvoiceId.ToString(), NewValue: $"{{\"paidVia\":\"{paidVia}\"}}"));
    }

    public async Task ReleaseAsync(Invoice invoice, CheckoutSession session, string reason,
        Guid? actorId, CancellationToken ct)
    {
        RequireTransaction();
        if (session.State is "Cancelled" or "Expired" || invoice.Status == InvoiceStatus.Void) return;
        if (invoice.Status == InvoiceStatus.Paid)
            throw new ConflictException("checkout_already_paid", "Checkout đã thanh toán.");
        if (session.ResourceHoldId is Guid holdId)
            await classes.ReleaseAsync(holdId, ct);
        if (invoice.PointsApplied > 0)
            await wallets.ReleaseAsync(new WalletOperation(invoice.MemberId, invoice.PointsApplied,
                "CheckoutSession", session.CheckoutSessionId, actorId), ct);
        if (invoice.MemberPackageId is Guid packageId)
        {
            var package = await db.Set<MemberPackage>().SingleOrDefaultAsync(x => x.MemberPackageId == packageId, ct);
            if (package is { Status: MemberPackageStatus.PendingPayment })
                package.Status = MemberPackageStatus.Cancelled;
        }
        var ptItem = await db.Set<InvoiceItem>().SingleOrDefaultAsync(x => x.InvoiceId == invoice.InvoiceId
            && x.ItemType == InvoiceItemType.PT, ct);
        if (ptItem?.RelatedEntityId is Guid entitlementId)
            await pt.CancelAsync(entitlementId, reason, ct);
        invoice.Status = InvoiceStatus.Void;
        session.State = reason;
        await db.Set<PaymentAttempt>().Where(x => x.CheckoutSessionId == session.CheckoutSessionId
                && x.Status == PaymentAttemptStatus.Pending)
            .ExecuteUpdateAsync(x => x.SetProperty(a => a.Status, PaymentAttemptStatus.Expired), ct);
        audit.Write(new AuditEntry(actorId ?? invoice.IssuedByUserId, "RELEASE_CHECKOUT", nameof(Invoice), invoice.InvoiceId.ToString(),
            Reason: reason));
    }

    public async Task CompensateCashAsync(Invoice invoice, VerifiedGatewayEvent proof, CancellationToken ct)
    {
        RequireTransaction();
        if (proof.Amount <= 0 || proof.Amount % 1000 != 0 || proof.Amount / 1000 > int.MaxValue)
        {
            // Release the hold in the same transaction, then retain the exact captured
            // amount for manual settlement instead of rounding customer funds.
            proof.ProcessingStatus = "ManualCompensationRequired";
            proof.ProcessedAtUtc = clock.UtcNow;
            invoice.ReconciliationRequired = true;
            if (invoice.Status != InvoiceStatus.Paid)
            {
                invoice.Status = InvoiceStatus.PaidAfterReconciliation;
                invoice.PaidVia = "VnPayManualCompensation";
                invoice.PaidAtUtc = clock.UtcNow;
            }
            audit.Write(new AuditEntry(invoice.IssuedByUserId, "MANUAL_GATEWAY_COMPENSATION_REQUIRED",
                nameof(Invoice), invoice.InvoiceId.ToString(), Reason: proof.ProviderTransactionId));
            return;
        }
        await wallets.EarnAsync(new WalletOperation(invoice.MemberId, (int)(proof.Amount / 1000),
            "GatewayCompensation", proof.VerifiedGatewayEventId, invoice.IssuedByUserId,
            "Bồi hoàn khoản thu VNPay không thể cấp quyền lợi"), ct);
        proof.ProcessingStatus = "Compensated";
        proof.ProcessedAtUtc = clock.UtcNow;
        invoice.ReconciliationRequired = false;
        if (invoice.Status != InvoiceStatus.Paid)
        {
            invoice.Status = InvoiceStatus.PaidAfterReconciliation;
            invoice.PaidVia = "VnPayCompensated";
            invoice.PaidAtUtc = clock.UtcNow;
        }
        audit.Write(new AuditEntry(invoice.IssuedByUserId, "COMPENSATE_GATEWAY_PAYMENT",
            nameof(Invoice), invoice.InvoiceId.ToString(), Reason: proof.ProviderTransactionId));
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Fulfillment requires a database transaction.");
    }
}
