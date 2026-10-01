using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>Idempotent system-event refund credit. The entitlement-owning caller cancels its benefit in this transaction.</summary>
public sealed class RefundCreditService(ISportHubDbContext db, IPointWalletService wallets) : IRefundCreditService
{
    public async Task<RefundCreditResult> CreditAsync(RefundCreditRequest request,
        CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("System refund credits require the caller's transaction.");
        if (request.EventId == Guid.Empty || string.IsNullOrWhiteSpace(request.Reason)
            || request.RefundRatioPercent is < 0 or > 100)
            throw new BadRequestException("invalid_refund_credit", "Refund sự kiện thiếu event, lý do hoặc tỷ lệ hợp lệ.");

        var itemReference = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == request.InvoiceItemId, cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");
        // Serialize system events with manager refunds for this invoice before reading the cumulative cap.
        // Lock order matches PointRefundService (invoice, then item) to avoid inconsistent concurrent caps.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM invoices WHERE invoice_id = {itemReference.InvoiceId} FOR UPDATE", cancellationToken);
        var item = await db.Set<InvoiceItem>()
            .FromSqlInterpolated($"SELECT * FROM invoice_items WHERE item_id = {request.InvoiceItemId} FOR UPDATE")
            .SingleAsync(cancellationToken);
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);

        var prior = await db.Set<PointLedgerEntry>().AsNoTracking().SingleOrDefaultAsync(x =>
            x.InvoiceItemId == request.InvoiceItemId && x.ReferenceType == "SystemEvent"
            && x.ReferenceId == request.EventId && x.EntryType == PointEntryType.Earn,
            cancellationToken);
        if (prior is not null)
        {
            if (prior.Note != request.Reason.Trim())
                throw new ConflictException("refund_event_reference_conflict", "EventId đã được dùng cho refund khác.");
            return new RefundCreditResult(prior.Points, true);
        }

        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Chỉ item đã Paid được hoàn điểm.");

        var value = await RemainingPaidValueVndAsync(invoice, item, cancellationToken);
        var points = RefundCalculator.PointsForRatio(value, request.RefundRatioPercent);
        if (points == 0) return new RefundCreditResult(0, false);
        var result = await wallets.EarnAsync(new WalletOperation(invoice.MemberId, points,
            "SystemEvent", request.EventId, null, request.Reason.Trim(), item.ItemId), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return new RefundCreditResult(points, result.AlreadyApplied);
    }

    public async Task<RefundCreditResult> CreditDifferenceAsync(RefundCreditDifferenceRequest request,
        CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        if (request.EventId == Guid.Empty || request.Points <= 0 || string.IsNullOrWhiteSpace(request.Reason))
            throw new BadRequestException("invalid_transfer_credit", "Hoàn chênh lệch cần event, lý do và số điểm dương.");
        var itemReference = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == request.InvoiceItemId, cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");
        await LockItemAsync(itemReference, request.InvoiceItemId, cancellationToken);
        var prior = await db.Set<PointLedgerEntry>().AsNoTracking().SingleOrDefaultAsync(x =>
            x.InvoiceItemId == request.InvoiceItemId && x.ReferenceType == "ClassTransferDifference"
            && x.ReferenceId == request.EventId && x.EntryType == PointEntryType.Earn, cancellationToken);
        if (prior is not null)
        {
            if (prior.Points != request.Points || prior.Note != request.Reason.Trim())
                throw new ConflictException("transfer_credit_reference_conflict", "EventId đã được dùng cho chênh lệch khác.");
            return new RefundCreditResult(prior.Points, true);
        }
        var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == request.InvoiceItemId, cancellationToken);
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Chỉ item đã Paid được hoàn điểm.");
        var remaining = await RemainingPaidValueVndAsync(invoice, item, cancellationToken);
        if (request.Points * (decimal)RefundCalculator.VndPerPoint > remaining)
            throw new ConflictException("transfer_credit_exceeds_item_value", "Hoàn chênh lệch vượt phần giá trị item còn lại.");
        var result = await wallets.EarnAsync(new WalletOperation(invoice.MemberId, request.Points,
            "ClassTransferDifference", request.EventId, null, request.Reason.Trim(), item.ItemId), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return new RefundCreditResult(request.Points, result.AlreadyApplied);
    }

    public async Task<decimal> GetRemainingItemValueVndAsync(Guid invoiceItemId, CancellationToken cancellationToken = default)
    {
        var item = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == invoiceItemId, cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == item.InvoiceId, cancellationToken);
        if (!SportHub.Payment.Domain.Rules.InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia))
            throw new ConflictException("refund_invoice_not_paid", "Chỉ item đã Paid được hoàn điểm.");
        return await RemainingPaidValueVndAsync(invoice, item, cancellationToken);
    }

    public async Task LockPaidItemAsync(Guid invoiceItemId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var itemReference = await db.Set<InvoiceItem>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ItemId == invoiceItemId, cancellationToken)
            ?? throw new NotFoundException("invoice_item_not_found", "Không tìm thấy sản phẩm hóa đơn.");
        await LockItemAsync(itemReference, invoiceItemId, cancellationToken);
    }

    private async Task<decimal> RemainingPaidValueVndAsync(Invoice invoice, InvoiceItem item, CancellationToken ct)
    {
        var totalItemValue = await db.Set<InvoiceItem>().Where(x => x.InvoiceId == invoice.InvoiceId)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        if (totalItemValue <= 0 || item.LineAmount <= 0)
            throw new ConflictException("refund_item_value_invalid", "InvoiceItem không có giá trị dương.");
        var cash = await db.Set<Domain.Entities.Payment>().Where(x => x.InvoiceId == invoice.InvoiceId
                && x.Status == PaymentStatus.Success).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var pointsSpent = invoice.CheckoutCycleId is not null
            ? invoice.PointsApplied * (decimal)RefundCalculator.VndPerPoint : 0m;
        var paidShare = Math.Min(item.LineAmount,
            decimal.Floor((cash + pointsSpent) * item.LineAmount / totalItemValue));
        var paidTransferDifferences = await db.Set<InvoiceItem>().Where(x => x.SourceInvoiceItemId == item.ItemId
                && (x.Invoice!.Status == InvoiceStatus.Paid || (x.Invoice.Status == InvoiceStatus.PaidAfterReconciliation && x.Invoice.PaidVia == "VnPayAfterReconciliation")))
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        var requestedPoints = await db.Set<PaymentAdjustment>().Where(x => x.InvoiceItemId == item.ItemId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(x => (int?)x.ApprovedPoints, ct) ?? 0;
        var systemPoints = await db.Set<PointLedgerEntry>().Where(x => x.InvoiceItemId == item.ItemId
                && x.ReferenceType == "SystemEvent" && x.EntryType == PointEntryType.Earn)
            .SumAsync(x => (int?)x.Points, ct) ?? 0;
        var oldCash = await db.Set<PaymentAdjustment>().Where(x => x.InvoiceItemId == item.ItemId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed
                && x.ApprovedPoints == 0)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var transferPoints = await db.Set<PointLedgerEntry>().Where(x => x.InvoiceItemId == item.ItemId
                && x.ReferenceType == "ClassTransferDifference" && x.EntryType == PointEntryType.Earn)
            .SumAsync(x => (int?)x.Points, ct) ?? 0;
        return Math.Max(0m, paidShare + paidTransferDifferences - (requestedPoints + systemPoints)
            * (decimal)RefundCalculator.VndPerPoint - oldCash
            - transferPoints * (decimal)RefundCalculator.VndPerPoint);
    }

    private async Task LockItemAsync(InvoiceItem itemReference, Guid invoiceItemId, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM invoices WHERE invoice_id = {itemReference.InvoiceId} FOR UPDATE", ct);
        await db.Set<InvoiceItem>().FromSqlInterpolated(
            $"SELECT * FROM invoice_items WHERE item_id = {invoiceItemId} FOR UPDATE").SingleAsync(ct);
    }

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("System refund credits require the caller's transaction.");
    }
}
