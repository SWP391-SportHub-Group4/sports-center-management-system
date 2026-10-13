using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Payment/fulfillment mutations belong to the caller's transaction.
/// A failed benefit rolls back payment effects and point effects together.
/// </summary>
public sealed class PaymentFulfillmentService(
    ISportHubDbContext db,
    IPointWalletService wallets,
    IClassEnrollmentFulfillment classes,
    IPtPurchaseFulfillment pt,
    ICourtRentalFulfillment rentals,
    IPackageActivationService packages,
    IRefundCreditService refunds,
    IMembershipFulfillment memberships,
    IAuditWriter audit,
    IClock clock,
    PaymentNoticeService notices)
{
    /// <summary>
    /// Completes a checkout that is paid 100% with Member points.
    /// </summary>
    public async Task CompletePointsAsync(
        Invoice invoice,
        CheckoutSession session,
        CancellationToken ct)
    {
        RequireTransaction();

        if (
            invoice.CashAmount != 0 ||
            invoice.PointsApplied <= 0 ||
            invoice.Status != InvoiceStatus.Issued ||
            session.State != "Active" ||
            session.ExpiresAtUtc <= clock.UtcNow)
        {
            throw new ConflictException(
                "checkout_unavailable",
                "Checkout unavailable.");
        }

        await SpendAndFulfillAsync(
            invoice,
            session,
            "Points",
            ct);

        // Persist final invoice status, wallet operation and fulfillment first.
        // The outer transaction is still active and has not committed yet.
        await db.SaveChangesAsync(ct);

        // Build receipt from the persisted PAID state.
        await notices.PaidReceiptAsync(
            invoice,
            ct);

        // Persist in-app + encrypted email outbox rows in the same transaction.
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Completes a checkout after a verified gateway payment.
    ///
    /// Supports:
    /// - VNPay only
    /// - VNPay + points
    /// - late payment after reconciliation
    /// </summary>
    public async Task CompleteVerifiedAsync(
        Invoice invoice,
        CheckoutSession session,
        PaymentAttempt attempt,
        VerifiedGatewayEvent proof,
        CancellationToken ct,
        bool lateReacquired = false)
    {
        RequireTransaction();

        if (
            invoice.Status != InvoiceStatus.Issued ||
            session.State != "Active" ||
            session.ExpiresAtUtc <= clock.UtcNow ||
            (
                !lateReacquired &&
                attempt.CheckoutSessionId !=
                session.CheckoutSessionId
            ) ||
            attempt.Amount != invoice.CashAmount ||
            attempt.PointsSnapshot != invoice.PointsApplied)
        {
            throw new ConflictException(
                "checkout_reconciliation_required",
                "Checkout reconciliation required.");
        }

        db.Set<Domain.Entities.Payment>()
            .Add(
                new Domain.Entities.Payment
                {
                    PaymentId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    Amount = proof.Amount,

                    PaymentAttemptId =
                        attempt.PaymentAttemptId,

                    Method =
                        PaymentMethod.VnPay,

                    ReferenceCode =
                        proof.ProviderTransactionId,

                    Status =
                        PaymentStatus.Success,

                    ReceivedByUserId =
                        invoice.IssuedByUserId,

                    // VNPay vnp_PayDate is the source of truth for
                    // cash collection reporting.
                    PaidAt =
                        proof.ProviderPaidAtUtc
                });

        attempt.Status =
            PaymentAttemptStatus.Succeeded;

        attempt.ProviderTransactionId =
            proof.ProviderTransactionId;

        attempt.VerifiedResult =
            "Paid";

        attempt.VerifiedAtUtc =
            proof.VerifiedAtUtc;

        await SpendAndFulfillAsync(
            invoice,
            session,
            lateReacquired
                ? "VnPayAfterReconciliation"
                : invoice.PointsApplied > 0
                    ? "VnPayAndPoints"
                    : "VnPay",
            ct);

        if (lateReacquired)
        {
            invoice.Status =
                InvoiceStatus.PaidAfterReconciliation;
        }

        proof.ProcessingStatus =
            "Fulfilled";

        proof.ProcessedAtUtc =
            clock.UtcNow;

        // Persist payment + PAID invoice + fulfillment first.
        await db.SaveChangesAsync(ct);

        // Generate receipt only when payment and benefit are already recorded.
        await notices.PaidReceiptAsync(
            invoice,
            ct);

        // Persist notification/email outbox in same transaction.
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Applies points, activates the purchased service and changes the
    /// invoice to its paid state.
    ///
    /// Do NOT generate the email receipt inside this method because
    /// its changes have not necessarily been flushed to DB yet.
    /// </summary>
    private async Task SpendAndFulfillAsync(
        Invoice invoice,
        CheckoutSession session,
        string paidVia,
        CancellationToken ct)
    {
        var item =
            await db.Set<InvoiceItem>()
                .SingleAsync(
                    x =>
                        x.InvoiceId ==
                        invoice.InvoiceId,
                    ct);

        if (invoice.PointsApplied > 0)
        {
            await wallets.SpendAsync(
                new WalletOperation(
                    invoice.MemberId,
                    invoice.PointsApplied,
                    "CheckoutSession",
                    session.CheckoutSessionId,
                    invoice.IssuedByUserId,
                    InvoiceItemId: item.ItemId),
                ct);
        }

        switch (item.ItemType)
        {
            case InvoiceItemType.Membership:
            {
                await packages
                    .ActivateIfObligationMetAsync(
                        invoice,
                        new InvoiceBalance(
                            invoice.TotalAmount,
                            invoice.TotalAmount,
                            0,
                            0),
                        invoice.IssuedByUserId,
                        ct);

                break;
            }

            case InvoiceItemType.ClassPackage:
            {
                if (
                    session.ResourceHoldId
                    is not Guid holdId)
                {
                    throw new ConflictException(
                        "checkout_hold_missing",
                        "Checkout hold missing.");
                }

                await classes.ConfirmAsync(
                    holdId,
                    item.ItemId,
                    ct);

                break;
            }

            case InvoiceItemType.ClassTransferDifference:
            {
                if (
                    session.Kind !=
                        "ClassTransfer" ||
                    session.ResourceHoldId
                        is not Guid transferHoldId ||
                    item.RelatedEntityId
                        is not Guid thresholdResponseId ||
                    item.SourceInvoiceItemId
                        is not Guid sourceItemId)
                {
                    throw new ConflictException(
                        "class_transfer_checkout_invalid",
                        "Class transfer checkout invalid.");
                }

                await refunds.LockPaidItemAsync(
                    sourceItemId,
                    ct);

                await classes.CompleteTransferAsync(
                    thresholdResponseId,
                    transferHoldId,
                    item.ItemId,
                    ct);

                break;
            }

            case InvoiceItemType.PT:
            {
                if (
                    (
                        item.PtEntitlementId ??
                        item.RelatedEntityId
                    )
                    is not Guid ptId)
                {
                    throw new ConflictException(
                        "pt_entitlement_missing",
                        "Pt entitlement missing.");
                }

                await pt.ActivateAsync(
                    ptId,
                    ct);

                break;
            }

            case InvoiceItemType.Rental:
            {
                if (
                    session.Kind !=
                        "CourtRental" ||
                    session.ResourceHoldId
                        is not Guid rentalId ||
                    (
                        item.CourtRentalId ??
                        item.RelatedEntityId
                    ) != rentalId)
                {
                    throw new ConflictException(
                        "rental_checkout_invalid",
                        "Rental checkout invalid.");
                }

                await rentals.ConfirmAsync(
                    rentalId,
                    item.ItemId,
                    ct);

                break;
            }

            default:
            {
                throw new ConflictException(
                    "checkout_kind_unsupported",
                    "Checkout kind unsupported.");
            }
        }

        invoice.Status =
            InvoiceStatus.Paid;

        invoice.PaidVia =
            paidVia;

        invoice.PaidAtUtc =
            clock.UtcNow;

        invoice.ReconciliationRequired =
            false;

        session.State =
            "Paid";

        // Receipt is intentionally NOT queued here.
        // CompletePointsAsync / CompleteVerifiedAsync call SaveChanges first,
        // then generate the full receipt from the persisted PAID invoice.

        audit.Write(
            new AuditEntry(
                invoice.IssuedByUserId,
                "FULFILL_CHECKOUT",
                nameof(Invoice),
                invoice.InvoiceId.ToString(),
                NewValue:
                    $"{{\"paidVia\":\"{paidVia}\"}}"));
    }

    /// <summary>
    /// Releases an unpaid checkout and all related resource/point holds.
    /// </summary>
    public async Task ReleaseAsync(
        Invoice invoice,
        CheckoutSession session,
        string reason,
        Guid? actorId,
        CancellationToken ct)
    {
        RequireTransaction();

        if (
            session.State is
                "Cancelled" or "Expired" ||
            invoice.Status ==
                InvoiceStatus.Void)
        {
            return;
        }

        if (
            invoice.Status is
                InvoiceStatus.Paid or
                InvoiceStatus.PaidAfterReconciliation)
        {
            throw new ConflictException(
                "checkout_already_paid",
                "Checkout already paid.");
        }

        if (
            session.ResourceHoldId
            is Guid holdId)
        {
            if (
                session.Kind ==
                "CourtRental")
            {
                await rentals.ReleaseAsync(
                    holdId,
                    ct);
            }
            else
            {
                await classes.ReleaseAsync(
                    holdId,
                    ct);
            }
        }

        if (invoice.PointsApplied > 0)
        {
            await wallets.ReleaseAsync(
                new WalletOperation(
                    invoice.MemberId,
                    invoice.PointsApplied,
                    "CheckoutSession",
                    session.CheckoutSessionId,
                    actorId),
                ct);
        }

        if (
            invoice.MemberPackageId
            is Guid packageId)
        {
            await memberships.ReleaseAsync(
                packageId,
                ct);
        }

        var ptItem =
            await db.Set<InvoiceItem>()
                .SingleOrDefaultAsync(
                    x =>
                        x.InvoiceId ==
                            invoice.InvoiceId &&
                        x.ItemType ==
                            InvoiceItemType.PT,
                    ct);

        if (
            ptItem?.RelatedEntityId
            is Guid entitlementId)
        {
            await pt.CancelAsync(
                entitlementId,
                reason,
                ct);
        }

        invoice.Status =
            InvoiceStatus.Void;

        session.State =
            reason;

        await db.Set<PaymentAttempt>()
            .Where(
                x =>
                    x.CheckoutSessionId ==
                        session.CheckoutSessionId &&
                    x.Status ==
                        PaymentAttemptStatus.Pending)
            .ExecuteUpdateAsync(
                x =>
                    x.SetProperty(
                        a => a.Status,
                        PaymentAttemptStatus.Expired),
                ct);

        audit.Write(
            new AuditEntry(
                actorId ??
                invoice.IssuedByUserId,
                "RELEASE_CHECKOUT",
                nameof(Invoice),
                invoice.InvoiceId.ToString(),
                Reason: reason));
    }

    /// <summary>
    /// Compensates a verified cash collection when fulfillment could
    /// not safely complete.
    /// </summary>
    public async Task CompensateCashAsync(
        Invoice invoice,
        VerifiedGatewayEvent proof,
        CancellationToken ct)
    {
        RequireTransaction();

        if (
            proof.Amount <= 0 ||
            proof.Amount % 1000 != 0 ||
            proof.Amount / 1000 >
                int.MaxValue)
        {
            proof.ProcessingStatus =
                "ManualCompensationRequired";

            proof.ProcessedAtUtc =
                clock.UtcNow;

            invoice.ReconciliationRequired =
                true;

            if (
                !InvoiceFulfillment
                    .HasBenefits(
                        invoice.Status,
                        invoice.PaidVia))
            {
                invoice.Status =
                    InvoiceStatus
                        .PaidAfterReconciliation;

                invoice.PaidVia =
                    "VnPayManualCompensation";

                invoice.PaidAtUtc =
                    clock.UtcNow;
            }

            audit.Write(
                new AuditEntry(
                    invoice.IssuedByUserId,
                    "MANUAL_GATEWAY_COMPENSATION_REQUIRED",
                    nameof(Invoice),
                    invoice.InvoiceId.ToString(),
                    Reason:
                        proof.ProviderTransactionId));

            return;
        }

        await wallets.EarnAsync(
            new WalletOperation(
                invoice.MemberId,
                (int)(
                    proof.Amount /
                    1000),
                "GatewayCompensation",
                proof.VerifiedGatewayEventId,
                invoice.IssuedByUserId,
                "Compensation for a VNPay payment that could not grant the benefit"),
            ct);

        await notices.QueueAsync(
            invoice.MemberId,
            SportHub.BuildingBlocks
                .Abstractions
                .Notifications
                .NotificationEvents
                .RefundCompleted,
            proof.VerifiedGatewayEventId,
            $"Compensated {proof.Amount / 1000:N0} points for the collected payment on invoice {invoice.InvoiceNumber}.",
            ct);

        proof.ProcessingStatus =
            "Compensated";

        proof.ProcessedAtUtc =
            clock.UtcNow;

        invoice.ReconciliationRequired =
            false;

        if (
            !InvoiceFulfillment
                .HasBenefits(
                    invoice.Status,
                    invoice.PaidVia))
        {
            invoice.Status =
                InvoiceStatus
                    .PaidAfterReconciliation;

            invoice.PaidVia =
                "VnPayCompensated";

            invoice.PaidAtUtc =
                clock.UtcNow;
        }

        audit.Write(
            new AuditEntry(
                invoice.IssuedByUserId,
                "COMPENSATE_GATEWAY_PAYMENT",
                nameof(Invoice),
                invoice.InvoiceId.ToString(),
                Reason:
                    proof.ProviderTransactionId));
    }

    private void RequireTransaction()
    {
        if (
            db.Database.CurrentTransaction
            is null)
        {
            throw new
                InvalidOperationException(
                    "Fulfillment requires a database transaction.");
        }
    }
}