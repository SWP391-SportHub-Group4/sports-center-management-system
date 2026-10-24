using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

public sealed record PointConversionResult(Guid InvoiceId, int Points, decimal RemainderVnd,
    string FulfillmentOutcome = "COMPENSATED");

public sealed class UnactivatedPaymentResolutionService(ISportHubDbContext db, IPointWalletService wallets,
    IAuditWriter audit, INotificationWriter notifications)
{
    public async Task<PointConversionResult> ConvertToPointsAsync(Guid invoiceId, Guid memberId,
        string idempotencyKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 120)
            throw new BadRequestException("idempotency_key_required", "Idempotency-Key is required.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await db.Set<Invoice>().FromSqlInterpolated(
            $"SELECT * FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("invoice_not_found", "Invoice not found.");
        if (invoice.MemberId != memberId)
            throw new ForbiddenException("invoice_not_owned", "Invoice not owned.");

        var captured = await db.Set<Domain.Entities.Payment>().AsNoTracking()
            .Where(p => p.InvoiceId == invoiceId && p.Status == PaymentStatus.Success
                && p.Method == PaymentMethod.VnPay)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var alreadyFulfilled = InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia);
        var convertibleAmount = alreadyFulfilled ? captured - invoice.CashAmount : captured;
        var wholePoints = decimal.Floor(convertibleAmount / 1000m);
        if (wholePoints <= 0 || wholePoints > int.MaxValue)
            throw new ConflictException("point_conversion_unavailable", "This payment cannot be converted to points.");
        var result = new PointConversionResult(invoiceId, (int)wholePoints,
            convertibleAmount - wholePoints * 1000m);

        if (invoice.Status == InvoiceStatus.Compensated
            || alreadyFulfilled && invoice.ResolutionIdempotencyKey is not null)
        {
            if (invoice.ResolutionIdempotencyKey != idempotencyKey)
                throw new ConflictException(PaymentSupportErrorCodes.ReconciliationAlreadyResolved,
                    "This payment has already been resolved.");
            if (await db.Set<VerifiedGatewayEvent>().AnyAsync(e => e.ProcessingStatus == "Unactivated"
                    && db.Set<PaymentAttempt>().Any(a => a.PaymentAttemptId == e.PaymentAttemptId
                        && a.InvoiceId == invoiceId), ct))
                throw new ConflictException(PaymentSupportErrorCodes.ReconciliationAlreadyResolved,
                    "A new capture arrived after this invoice was resolved. Please request support.");
            await tx.CommitAsync(ct);
            return result;
        }
        var hasUnactivatedProof = await db.Set<VerifiedGatewayEvent>().AnyAsync(e =>
            e.ProcessingStatus == "Unactivated" && db.Set<PaymentAttempt>().Any(a =>
                a.PaymentAttemptId == e.PaymentAttemptId && a.InvoiceId == invoiceId), ct);
        if (!hasUnactivatedProof
            || !(invoice.Status == InvoiceStatus.PaidAfterReconciliation
                && invoice.PaidVia == "VnPayAwaitingResolution" && invoice.ReconciliationRequired
                || alreadyFulfilled)
            || await db.Set<MemberSupportRequest>().AnyAsync(r => r.InvoiceId == invoiceId
                && r.Category == "PAYMENT", ct))
            throw new ConflictException(PaymentSupportErrorCodes.ReconciliationAlreadyResolved,
                "This payment has already been resolved or a support request was selected.");

        await wallets.EarnAsync(new WalletOperation(memberId, result.Points,
            "UnactivatedInvoiceConversion", invoiceId, memberId,
            "Points selected for a payment that could not activate the service"), ct);
        if (!alreadyFulfilled)
        {
            invoice.Status = InvoiceStatus.Compensated;
            invoice.PaidVia = "VnPayConvertedToPoints";
        }
        invoice.ReconciliationRequired = false;
        invoice.ResolutionIdempotencyKey = idempotencyKey;
        await db.Set<VerifiedGatewayEvent>().Where(e => e.ProcessingStatus == "Unactivated"
            && db.Set<PaymentAttempt>().Any(a => a.PaymentAttemptId == e.PaymentAttemptId
                && a.InvoiceId == invoiceId))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.ProcessingStatus, "ConvertedToPoints"), ct);
        audit.Write(new AuditEntry(memberId, "CONVERT_UNACTIVATED_PAYMENT_TO_POINTS",
            nameof(Invoice), invoiceId.ToString(), IsSystem: false));
        notifications.Queue(new NotificationRequest(memberId, NotificationEvents.PaymentConvertedToPoints,
            $"{result.Points:N0} points were added for invoice {invoice.InvoiceNumber}.", invoiceId));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return result;
    }
}
