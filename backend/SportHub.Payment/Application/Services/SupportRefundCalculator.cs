using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

public sealed record SupportRefundItem(Guid InvoiceItemId, string Description, decimal TotalVnd,
    decimal VnpayVnd, int PointsApplied, decimal PointsVnd, decimal RefundableVnpayVnd, int RefundablePoints,
    decimal RefundableValueVnd, int MaxRefundablePoints);

/// <summary>One refund scope and one calculation for the member form and the manager's locked payout.</summary>
public static class SupportRefundCalculator
{
    public static async Task<Guid> ResolveItemAsync(ISportHubDbContext db, Guid invoiceId, Guid? itemId, CancellationToken ct)
    {
        var ids = await db.Set<InvoiceItem>().AsNoTracking().Where(i => i.InvoiceId == invoiceId)
            .Select(i => i.ItemId).ToListAsync(ct);
        if (itemId is Guid selected && ids.Contains(selected)) return selected;
        if (itemId is null && ids.Count == 1) return ids[0];
        throw new BadRequestException("payment_request_item_required", "Choose the service on this invoice that needs a refund.");
    }

    public static async Task<IReadOnlyList<SupportRefundItem>> ItemsAsync(ISportHubDbContext db, Invoice invoice, CancellationToken ct)
    {
        var items = await db.Set<InvoiceItem>().AsNoTracking().Where(i => i.InvoiceId == invoice.InvoiceId)
            .OrderBy(i => i.ItemId).ToListAsync(ct);
        var total = items.Sum(i => i.LineAmount);
        if (total <= 0) return [];
        var captured = await db.Set<Domain.Entities.Payment>().Where(p => p.InvoiceId == invoice.InvoiceId
            && p.Status == PaymentStatus.Success && p.Method == PaymentMethod.VnPay)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var spent = invoice.CheckoutCycleId is not null ? invoice.PointsApplied : 0;
        var payouts = await db.Set<MemberSupportPayout>().AsNoTracking().Where(p => p.InvoiceId == invoice.InvoiceId).ToListAsync(ct);
        // Do not guess which service a historical invoice-wide bank transfer refunded.
        if (items.Count > 1 && payouts.Any(p => p.InvoiceItemId == null))
            throw new ConflictException("payout_legacy_review_required", "This invoice has an older refund without a service reference. Review its refund history before making another transfer.");
        var bankRemaining = Math.Max(0m, captured - payouts.Sum(p => p.Amount));
        var result = new List<SupportRefundItem>();
        var paidTotal = Math.Min(total, captured + spent * 1000m);
        var pointTotal = Math.Min(spent, (int)decimal.Floor(paidTotal / 1000m));
        var paidShares = items.Select(i => decimal.Floor(paidTotal * i.LineAmount / total)).ToArray();
        paidShares[^1] += paidTotal - paidShares.Sum();
        var pointShares = items.Select((item, index) => Math.Min((int)decimal.Floor(paidShares[index] / 1000m),
            (int)decimal.Floor(pointTotal * item.LineAmount / total))).ToArray();
        var pointsLeft = pointTotal - pointShares.Sum();
        // Whole-point rounding is deterministic; the bank share is the remaining VND value.
        // This preserves both payment totals without assigning more than a line's paid value.
        while (pointsLeft > 0)
        {
            var changed = false;
            for (var index = 0; index < items.Count && pointsLeft > 0; index++)
                if ((pointShares[index] + 1) * 1000m <= paidShares[index])
                {
                    pointShares[index]++; pointsLeft--; changed = true;
                }
            if (!changed) break;
        }
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var points = pointShares[index];
            var bank = paidShares[index] - points * 1000m;
            var completed = await db.Set<PaymentAdjustment>().Where(a => a.InvoiceItemId == item.ItemId
                && a.Type == PaymentAdjustmentType.Refund && a.Status == PaymentAdjustmentStatus.Completed).ToListAsync(ct);
            var credits = await db.Set<PointLedgerEntry>().Where(l => l.InvoiceItemId == item.ItemId
                && l.EntryType == PointEntryType.Earn && (l.ReferenceType == "SystemEvent" || l.ReferenceType == "ClassTransferDifference"))
                .ToListAsync(ct);
            var supportPoints = credits.Where(l => l.Note != null && l.Note.StartsWith("SupportRefund:")).Sum(l => l.Points);
            var otherRefunds = completed.Sum(a => a.ApprovedPoints > 0 ? a.ApprovedPoints * 1000m : a.Amount)
                + credits.Where(l => l.Note == null || !l.Note.StartsWith("SupportRefund:")).Sum(l => l.Points) * 1000m;
            var returnedBank = payouts.Where(p => p.InvoiceItemId == item.ItemId || (items.Count == 1 && p.InvoiceItemId == null)).Sum(p => p.Amount);
            // Existing point-only refunds reduce the remaining paid value proportionally across the original methods.
            var paidValue = bank + points * 1000m;
            var remainingBeforeSupport = Math.Max(0m, Math.Min(item.LineAmount, paidValue) - otherRefunds);
            var ratio = paidValue > 0 ? remainingBeforeSupport / paidValue : 0m;
            var refundBank = Math.Min(bankRemaining, Math.Max(0m, decimal.Floor(bank * ratio) - returnedBank));
            var refundPoints = Math.Max(0, (int)decimal.Floor(points * ratio) - supportPoints);
            // Cash may be returned as wallet points. Count both forms against the same remaining value,
            // including earlier conversions, so a later request cannot refund the converted cash again.
            var remainingValue = Math.Max(0m, remainingBeforeSupport - returnedBank - supportPoints * 1000m);
            refundBank = Math.Min(refundBank, remainingValue);
            refundPoints = Math.Min(refundPoints, (int)decimal.Floor(remainingValue / 1000m));
            result.Add(new(item.ItemId, item.Description, item.LineAmount, bank, points, points * 1000m,
                refundBank, refundPoints, remainingValue, (int)decimal.Floor(remainingValue / 1000m)));
        }
        return result;
    }
}
