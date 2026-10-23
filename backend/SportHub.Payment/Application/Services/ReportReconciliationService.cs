using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Cross-checks the revenue report against its sources: invoices, payments, point ledger and completed refunds.
/// Every "actual" figure is a single database aggregate that does not reuse the report's own code path, so a bug or a
/// stale cache in the report shows up as a delta instead of being repeated. Safe on large periods: it streams no rows.
/// </summary>
public sealed class ReportReconciliationService(ISportHubDbContext db, IRevenueReportService revenue)
{
    public const int MaxMismatchSamples = 50;
    private static readonly string[] RefundReferenceTypes = ["PaymentAdjustment", "SystemEvent", "ClassTransferDifference"];

    public async Task<ReportReconciliationResponse> ReconcileAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default)
    {
        if (toDate < fromDate) (fromDate, toDate) = (toDate, fromDate);
        if (toDate.DayNumber - fromDate.DayNumber > 366)
            throw new BadRequestException("range_too_large", "The reconciliation range cannot exceed 366 days.");

        var clock = Stopwatch.StartNew();
        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var report = await revenue.GetAsync(fromDate, toDate, ct);

        var paymentsInRange = db.Set<Domain.Entities.Payment>().AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Success && p.PaidAt >= fromUtc && p.PaidAt < toUtc);
        var cash = await paymentsInRange.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var paymentCount = await paymentsInRange.CountAsync(ct);
        var gatewayCash = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
            .Where(e => (e.ProcessingStatus == "Compensated" || e.ProcessingStatus == "ManualCompensationRequired")
                        && e.ProviderPaidAtUtc >= fromUtc && e.ProviderPaidAtUtc < toUtc)
            .SumAsync(e => (decimal?)e.Amount, ct) ?? 0m;
        var refunded = await db.Set<PaymentAdjustment>().AsNoTracking()
            .Where(a => a.Status == PaymentAdjustmentStatus.Completed && a.Type == PaymentAdjustmentType.Refund
                        && a.PointLedgerEntryId == null
                        && a.CompletedAtUtc != null && a.CompletedAtUtc >= fromUtc && a.CompletedAtUtc < toUtc)
            .SumAsync(a => (decimal?)a.Amount, ct) ?? 0m;

        var ledger = db.Set<PointLedgerEntry>().AsNoTracking().Where(e => e.CreatedAtUtc >= fromUtc && e.CreatedAtUtc < toUtc);
        var spent = await ledger.Where(e => e.EntryType == PointEntryType.Spend).SumAsync(e => (long?)e.Points, ct) ?? 0L;
        var earned = await ledger.Where(e => e.EntryType == PointEntryType.Earn).SumAsync(e => (long?)e.Points, ct) ?? 0L;
        var refundEarned = await ledger.Where(e => e.EntryType == PointEntryType.Earn && RefundReferenceTypes.Contains(e.ReferenceType))
            .SumAsync(e => (long?)e.Points, ct) ?? 0L;

        var checks = new List<ReconciliationCheck>
        {
            Check("Cash collected", report.TotalCollected, cash + gatewayCash),
            Check("Payment count", report.PaymentCount, paymentCount),
            Check("Cash refunds", report.TotalRefunded, refunded),
            Check("Net revenue", report.NetRevenue, cash + gatewayCash - refunded),
            Check("Points used", report.PointsRedeemed, spent),
            Check("Points credited", report.PointsIssued, earned),
            Check("Points refunded", report.PointsRefunded, refundEarned),
            // The daily breakdown must add up to the headline totals.
            Check("Daily cash adds up to total", report.TotalCollected, report.Daily.Sum(d => d.Collected)),
            Check("Daily refunds add up to total", report.TotalRefunded, report.Daily.Sum(d => d.Refunded)),
        };

        // Invoice level: what a paid invoice recorded must equal the payments and points behind it.
        var paidInvoiceIds = paymentsInRange.Select(p => p.InvoiceId).Distinct();
        var invoiceRows = from invoice in db.Set<Invoice>().AsNoTracking()
                          where invoice.Status == InvoiceStatus.Paid && paidInvoiceIds.Contains(invoice.InvoiceId)
                          select new
                          {
                              invoice.InvoiceId,
                              invoice.InvoiceNumber,
                              invoice.TotalAmount,
                              invoice.CashAmount,
                              invoice.PointsApplied,
                              PaymentsTotal = db.Set<Domain.Entities.Payment>()
                                  .Where(p => p.InvoiceId == invoice.InvoiceId && p.Status == PaymentStatus.Success)
                                  .Sum(p => (decimal?)p.Amount) ?? 0m
                          };
        var mismatched = invoiceRows.Where(x => x.PaymentsTotal != x.CashAmount
            || x.CashAmount + x.PointsApplied * 1000m != x.TotalAmount);
        var mismatchCount = await mismatched.CountAsync(ct);
        var samples = await mismatched.OrderBy(x => x.InvoiceNumber).Take(MaxMismatchSamples)
            .Select(x => new InvoiceMismatch(x.InvoiceId, x.InvoiceNumber, x.TotalAmount, x.CashAmount, x.PointsApplied, x.PaymentsTotal))
            .ToListAsync(ct);
        var invoiceCount = await invoiceRows.CountAsync(ct);

        clock.Stop();
        return new ReportReconciliationResponse(fromDate, toDate, DateTime.UtcNow,
            checks.All(c => c.Ok) && mismatchCount == 0, clock.ElapsedMilliseconds, checks, invoiceCount, mismatchCount, samples);
    }

    private static ReconciliationCheck Check(string name, decimal reported, decimal actual)
        => new(name, reported, actual, reported - actual, reported == actual);
}
