using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.BankRefunds;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Giá trị thực còn có thể hoàn của một InvoiceItem (VND) — NGUỒN DUY NHẤT cho hoàn điểm thủ công, hoàn điểm hệ thống và hoàn
/// tiền ngân hàng. Cap lũy kế tính trên cùng một công thức nên điểm và tiền không thể cùng nhận một giá trị.
/// Caller phải đã khóa invoice rồi item (FOR UPDATE) nếu cần đọc-rồi-ghi.
/// </summary>
internal static class RefundValue
{
    public static async Task<decimal> RemainingAsync(ISportHubDbContext db, Invoice invoice, InvoiceItem item,
        Guid? excludeBankRefundId, CancellationToken ct)
    {
        var totalItemValue = await db.Set<InvoiceItem>().Where(x => x.InvoiceId == invoice.InvoiceId)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        if (totalItemValue <= 0 || item.LineAmount <= 0)
            throw new ConflictException("refund_item_value_invalid", "Refund item value invalid.");
        var paid = await PaidSharesAsync(db, invoice, item, totalItemValue, ct);
        var paidTransferDifferences = await db.Set<InvoiceItem>().Where(x => x.SourceInvoiceItemId == item.ItemId
                && (x.Invoice!.Status == InvoiceStatus.Paid || (x.Invoice.Status == InvoiceStatus.PaidAfterReconciliation && x.Invoice.PaidVia == "VnPayAfterReconciliation")))
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        var priorPoints = await db.Set<PaymentAdjustment>().Where(x => x.InvoiceItemId == item.ItemId
                && x.Type == PaymentAdjustmentType.Refund && x.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(x => (int?)x.ApprovedPoints, ct) ?? 0;
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
        var committedBank = await CommittedBankAsync(db, item.ItemId, excludeBankRefundId, ct);
        return Math.Max(0m, paid.Total + paidTransferDifferences - (priorPoints + priorSystemPoints)
            * (decimal)RefundCalculator.VndPerPoint - priorLegacyPayout
            - priorTransferPoints * (decimal)RefundCalculator.VndPerPoint - committedBank);
    }

    /// <summary>Phần tiền mặt và phần điểm (VND) đã trả cho item này, chia theo tỷ trọng giá trị item trên hóa đơn.</summary>
    public static async Task<(decimal Cash, decimal Points, decimal Total)> PaidSharesAsync(ISportHubDbContext db,
        Invoice invoice, InvoiceItem item, decimal? totalItemValue, CancellationToken ct)
    {
        var total = totalItemValue ?? await db.Set<InvoiceItem>().Where(x => x.InvoiceId == invoice.InvoiceId)
            .SumAsync(x => (decimal?)x.LineAmount, ct) ?? 0m;
        if (total <= 0 || item.LineAmount <= 0) return (0m, 0m, 0m);
        var cash = await db.Set<Domain.Entities.Payment>().Where(x => x.InvoiceId == invoice.InvoiceId
                && x.Status == PaymentStatus.Success).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var points = invoice.CheckoutCycleId is not null && InvoiceFulfillment.HasBenefits(invoice.Status, invoice.PaidVia)
            ? invoice.PointsApplied * (decimal)RefundCalculator.VndPerPoint : 0m;
        var combined = Math.Min(item.LineAmount, decimal.Floor((cash + points) * item.LineAmount / total));
        var cashShare = decimal.Floor(cash * item.LineAmount / total);
        var pointsShare = Math.Max(0m, combined - cashShare);
        return (Math.Min(cashShare, combined), pointsShare, combined);
    }

    /// <summary>Tổng bank refund đã cam kết giá trị cho item: đã duyệt chờ chuyển (theo số duyệt) + đã chuyển (theo số chuyển).</summary>
    public static async Task<decimal> CommittedBankAsync(ISportHubDbContext db, Guid invoiceItemId,
        Guid? excludeBankRefundId, CancellationToken ct)
    {
        var query = db.Set<BankRefundRequest>().Where(x => x.InvoiceItemId == invoiceItemId
            && x.BankRefundId != excludeBankRefundId);
        var awaiting = await query.Where(x => x.Status == BankRefundStatuses.ApprovedAwaitingPayout)
            .SumAsync(x => (decimal?)x.ApprovedAmount, ct) ?? 0m;
        var paid = await query.Where(x => x.Status == BankRefundStatuses.Paid)
            .SumAsync(x => (decimal?)x.PayoutAmount, ct) ?? 0m;
        return awaiting + paid;
    }

    /// <summary>
    /// Một item đang có yêu cầu hoàn tiền ngân hàng (chờ duyệt, đã duyệt hoặc đã chuyển) không được hoàn điểm/hủy bằng điểm nữa,
    /// để Member không nhận cả điểm lẫn tiền. Rút yêu cầu (bị từ chối) thì mở lại nhánh điểm.
    /// </summary>
    public static async Task EnsureNoCommittedBankRefundAsync(ISportHubDbContext db, Guid invoiceItemId, CancellationToken ct,
        Guid? excludeBankRefundId = null)
    {
        if (await db.Set<BankRefundRequest>().AsNoTracking().AnyAsync(x => x.InvoiceItemId == invoiceItemId
                && x.BankRefundId != excludeBankRefundId && x.Status != BankRefundStatuses.Rejected, ct))
            throw new ConflictException("bank_refund_committed",
                "This item has a bank refund request in progress or completed. It cannot also be refunded as points.");
    }
}
