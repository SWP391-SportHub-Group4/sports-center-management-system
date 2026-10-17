using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// The revenue report must agree with the invoices, payments, point ledger and refunds behind it, including on a month
/// of busy-center volume. Each test uses its own far-past period so it never mixes with other tests' data.
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public sealed class ReportReconciliationTests(PaymentApiFactory factory)
{
    private sealed record Seeded(decimal Cash, long PointsSpent, long PointsRefunded, decimal CashRefunded, int Invoices,
        Guid FirstPaymentId);

    /// <summary>One cash-only invoice in three splits into points plus cash; a few get a cash refund and a refund credit.</summary>
    private async Task<Seeded> SeedMonthAsync(DateOnly firstDay, int invoiceCount)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var staff = await factory.SeedUserAsync(UserRole.Receptionist);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.ChangeTracker.AutoDetectChangesEnabled = false;

        var wallet = new PointWallet { WalletId = Guid.NewGuid(), OwnerUserId = member.UserId, CreatedAtUtc = DateTime.UtcNow };
        db.PointWallets.Add(wallet);
        await db.SaveChangesAsync();

        decimal cash = 0, cashRefunded = 0;
        long spent = 0, refundedPoints = 0;
        Guid firstPaymentId = Guid.Empty;
        for (var i = 0; i < invoiceCount; i++)
        {
            var split = i % 3 == 0;
            var points = split ? 40 : 0;
            var invoiceCash = split ? 60_000m : 100_000m;
            var paidAt = VietnamTime.StartOfDayUtc(firstDay.AddDays(i % 28)).AddHours(1 + i % 20).AddMinutes(i % 60);
            var invoice = new Invoice
            {
                InvoiceId = Guid.NewGuid(), InvoiceNumber = $"R{firstDay.Year}-{i:D6}-{Guid.NewGuid():N}"[..20],
                MemberId = member.UserId, IssuedByUserId = staff.UserId, TotalAmount = 100_000m,
                CashAmount = invoiceCash, PointsApplied = points, Status = InvoiceStatus.Paid, IssuedAt = paidAt,
                PaidAtUtc = paidAt
            };
            var item = new InvoiceItem
            {
                ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.Membership,
                Description = "Load test", UnitPrice = 100_000m, Quantity = 1, LineAmount = 100_000m
            };
            var payment = new Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = invoiceCash,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success, ReceivedByUserId = staff.UserId, PaidAt = paidAt
            };
            if (firstPaymentId == Guid.Empty) firstPaymentId = payment.PaymentId;
            db.Set<Invoice>().Add(invoice);
            db.Set<InvoiceItem>().Add(item);
            db.Set<Domain.Entities.Payment>().Add(payment);
            cash += invoiceCash;

            if (split)
            {
                db.Set<PointLedgerEntry>().Add(new PointLedgerEntry
                {
                    LedgerEntryId = Guid.NewGuid(), WalletId = wallet.WalletId, InvoiceItemId = item.ItemId,
                    EntryType = PointEntryType.Spend, Points = points, AvailableDelta = 0, HeldDelta = -points,
                    ReferenceType = "Checkout", ReferenceId = Guid.NewGuid(), CreatedAtUtc = paidAt
                });
                spent += points;
            }

            // Every 50th invoice is partly refunded: a cash refund recorded as completed, and a points credit.
            if (i % 50 == 0)
            {
                var completedAt = paidAt.AddHours(1);
                db.Set<PaymentAdjustment>().Add(new PaymentAdjustment
                {
                    AdjustmentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, InvoiceItemId = item.ItemId,
                    Type = PaymentAdjustmentType.Refund, Amount = 10_000m, RequestedAmount = 10_000m, Reason = "Load test",
                    Status = PaymentAdjustmentStatus.Completed, RequestedByUserId = staff.UserId, CreatedAt = paidAt,
                    CompletedAtUtc = completedAt, CompletedByUserId = staff.UserId, RefundMethod = PaymentMethod.Cash,
                    RefundReferenceCode = "LOAD"
                });
                db.Set<PointLedgerEntry>().Add(new PointLedgerEntry
                {
                    LedgerEntryId = Guid.NewGuid(), WalletId = wallet.WalletId, EntryType = PointEntryType.Earn, Points = 10,
                    AvailableDelta = 10, HeldDelta = 0, ReferenceType = "PaymentAdjustment", ReferenceId = Guid.NewGuid(),
                    CreatedAtUtc = completedAt
                });
                cashRefunded += 10_000m;
                refundedPoints += 10;
            }

            if (i % 1000 == 999) await db.SaveChangesAsync();
        }
        await db.SaveChangesAsync();
        return new Seeded(cash, spent, refundedPoints, cashRefunded, invoiceCount, firstPaymentId);
    }

    [Fact]
    public async Task A_busy_month_reconciles_to_the_source_tables_within_a_sane_time()
    {
        var first = new DateOnly(2003, 3, 1);
        var seeded = await SeedMonthAsync(first, 6000);
        using var scope = factory.Services.CreateScope();

        var timer = Stopwatch.StartNew();
        var report = await scope.ServiceProvider.GetRequiredService<IRevenueReportService>().GetAsync(first, first.AddDays(30));
        timer.Stop();

        // The report matches what the seed knows to be true.
        Assert.Equal(seeded.Cash, report.TotalCollected);
        Assert.Equal(seeded.CashRefunded, report.TotalRefunded);
        Assert.Equal(seeded.Cash - seeded.CashRefunded, report.NetRevenue);
        Assert.Equal(seeded.PointsSpent, report.PointsRedeemed);
        Assert.Equal(seeded.PointsRefunded, report.PointsRefunded);
        Assert.Equal(seeded.Invoices, report.PaymentCount);
        Assert.True(timer.Elapsed < TimeSpan.FromSeconds(30), $"Report took {timer.Elapsed.TotalSeconds:F1}s for {seeded.Invoices} invoices.");

        // And the independent reconciliation agrees, with every paid invoice checked.
        var result = await scope.ServiceProvider.GetRequiredService<ReportReconciliationService>().ReconcileAsync(first, first.AddDays(30));
        Assert.True(result.Ok, string.Join("; ", result.Checks.Where(c => !c.Ok).Select(c => $"{c.Name}: {c.Delta}")));
        Assert.Equal(seeded.Invoices, result.PaidInvoicesChecked);
        Assert.Equal(0, result.InvoiceMismatchCount);
        Assert.All(result.Checks, c => Assert.True(c.Ok, c.Name));
        Assert.True(result.DurationMs < 30_000, $"Reconciliation took {result.DurationMs} ms.");
    }

    [Fact]
    public async Task Reconciliation_flags_an_invoice_whose_payment_was_altered_after_the_fact()
    {
        var first = new DateOnly(2004, 3, 1);
        var seeded = await SeedMonthAsync(first, 300);
        await factory.QueryAsync(async db =>
        {
            await db.Set<Domain.Entities.Payment>().Where(p => p.PaymentId == seeded.FirstPaymentId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Amount, p => p.Amount + 5_000m));
            return 0;
        });
        using var scope = factory.Services.CreateScope();

        var result = await scope.ServiceProvider.GetRequiredService<ReportReconciliationService>().ReconcileAsync(first, first.AddDays(30));

        Assert.False(result.Ok);
        Assert.Equal(1, result.InvoiceMismatchCount);
        var mismatch = Assert.Single(result.InvoiceMismatches);
        Assert.Equal(mismatch.CashAmount + 5_000m, mismatch.PaymentsTotal);
        // The report itself still agrees with its sources; only the invoice disagrees with its payment.
        Assert.All(result.Checks, c => Assert.True(c.Ok, c.Name));
    }
}
