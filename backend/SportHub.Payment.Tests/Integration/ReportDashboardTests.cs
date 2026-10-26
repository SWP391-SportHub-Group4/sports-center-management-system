using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Administration.Application.Interfaces;
using System.Globalization;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ReportDashboardTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Membership_daily_buyers_deduplicate_each_day_and_period_excludes_day_passes()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var at = VietnamTime.StartOfDayUtc(new DateOnly(2012, 2, 28));
        foreach (var hours in new[] { 1, 2, 25 })
        {
            var package = await factory.SeedPendingPackageAsync(member.UserId);
            var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 3_000_000m, package.MemberPackage.MemberPackageId);
            await factory.QueryAsync(async db =>
            {
                var row = await db.Invoices.Include(i => i.Items).SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
                row.Status = InvoiceStatus.Paid; row.PaidAtUtc = at.AddHours(hours);
                row.Items.Single().MemberPackageId = package.MemberPackage.MemberPackageId;
                await db.SaveChangesAsync(); return true;
            });
        }
        using var scope = factory.Services.CreateScope();
        var reader = scope.ServiceProvider.GetRequiredService<SportHub.Membership.Application.Interfaces.IMembershipPurchaseReportReader>();
        var days = await reader.ReadDailyAsync(at, at.AddDays(2));
        Assert.Equal(2, days.Count);
        Assert.All(days, d => Assert.Equal(1, d.Buyers));
        Assert.Equal(new DateOnly(2012, 2, 29), days[1].Date);
        Assert.Equal(1, await reader.CountMembersAsync(at, at.AddDays(2)));
        Assert.Equal(0, await reader.CountDayPassesAsync(at, at.AddDays(2)));
    }
    [Fact]
    public async Task Filtered_cash_refunds_daily_sources_and_exports_share_the_same_scope()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var day = new DateOnly(2011, 3, 12);
        var at = VietnamTime.StartOfDayUtc(day);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, manager.UserId, 1_000_000m);
        var sport = await factory.QueryAsync(async db => await db.Set<SportHub.Scheduling.Catalog.Domain.Sport>().Select(s => s.SportId).FirstAsync());
        await factory.QueryAsync(async db =>
        {
            var item = await db.Set<InvoiceItem>().SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            item.ItemType = InvoiceItemType.Rental; item.LineAmount = 600_000m; item.UnitPrice = 600_000m; item.SportId = sport; item.SportNameSnapshot = "Test sport";
            db.Set<InvoiceItem>().Add(new() { ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, ItemType = InvoiceItemType.WalletTopUp, Quantity = 1, LineAmount = 400_000m, UnitPrice = 400_000m });
            db.Set<Domain.Entities.Payment>().Add(new() { PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Status = PaymentStatus.Success, Method = PaymentMethod.Cash, Amount = 1_000_000m, PaidAt = at.AddMinutes(1), ReceivedByUserId = manager.UserId });
            var wallet = new PointWallet { WalletId = Guid.NewGuid(), OwnerUserId = member.UserId, AvailablePoints = 50, CreatedAtUtc = at };
            db.Set<PointWallet>().Add(wallet);
            var ledger = new PointLedgerEntry { LedgerEntryId = Guid.NewGuid(), WalletId = wallet.WalletId, InvoiceItemId = item.ItemId, EntryType = PointEntryType.Earn, Points = 50, AvailableDelta = 50, AvailableAfter = 50, ReferenceType = "PaymentAdjustment", ReferenceId = Guid.NewGuid(), CreatedAtUtc = at.AddHours(2) };
            db.Set<PointLedgerEntry>().Add(ledger);
            foreach (var pointRefund in new[] { false, true })
                db.Set<PaymentAdjustment>().Add(new() { AdjustmentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, InvoiceItemId = item.ItemId, Type = PaymentAdjustmentType.Refund, Amount = pointRefund ? 50_000m : 100_000m, RequestedAmount = pointRefund ? 50_000m : 100_000m, Reason = "Reporting scope", Status = PaymentAdjustmentStatus.Completed, RequestedByUserId = manager.UserId, ApprovedByUserId = manager.UserId, CompletedByUserId = manager.UserId, CreatedAt = at, ApprovedAtUtc = at, CompletedAtUtc = at.AddHours(2), RefundMethod = PaymentMethod.Cash, PointLedgerEntryId = pointRefund ? ledger.LedgerEntryId : null });
            await db.SaveChangesAsync(); return true;
        });
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IRevenueReportService>();
        var report = await service.GetAsync(day, day, sportId: sport, source: "RENTAL", memberId: member.UserId);
        Assert.Equal(600_000m, report.TotalCollected);
        Assert.Equal(100_000m, report.TotalRefunded);
        Assert.Equal(500_000m, report.NetRevenue);
        Assert.Equal(50, report.PointsRefunded);
        Assert.Equal(report.TotalCollected, report.BySource.Sum(r => r.CashCollected));
        Assert.Equal(report.TotalCollected, report.BySportAndSource.Sum(r => r.CashCollected));
        Assert.Equal(report.NetRevenue, report.Daily.Sum(r => r.Net));
        var outside = await service.GetAsync(day.AddDays(-1), day.AddDays(-1), memberId: member.UserId);
        Assert.Equal(0, outside.TotalCollected);
        var exports = scope.ServiceProvider.GetRequiredService<IReportExportService>();
        foreach (var type in new[] { "REVENUE_SUMMARY", "REVENUE_DAILY" })
        {
            var export = await exports.CreateAsync(new() { ReportType = type, FromDate = day, ToDate = day, SportId = sport, Source = "RENTAL", MemberId = member.UserId, Columns = ["collectedAmount", "refundedAmount", "netCollected"] }, manager.UserId);
            Assert.Equal("Completed", export.Status);
            var (name, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
            Assert.Contains("2011-03-12", name);
            Assert.Contains("600000,100000,500000", System.Text.Encoding.UTF8.GetString(bytes));
        }
        var pdf = await exports.CreateAsync(new() { ReportType = "REVENUE_SUMMARY", FromDate = day, ToDate = day, SportId = sport, Source = "RENTAL", MemberId = member.UserId, Format = "Pdf", Columns = ["collectedAmount", "refundedAmount", "netCollected"] }, manager.UserId);
        Assert.Equal("Completed", pdf.Status);
        var (_, pdfBytes) = await exports.DownloadAsync(pdf.ReportExportId, manager.UserId, true);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(pdfBytes));
    }

    [Fact]
    public async Task Operational_exports_match_date_and_sport_filtered_readers()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
        var from = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        var to = from.AddDays(30);
        var exports = scope.ServiceProvider.GetRequiredService<IReportExportService>();
        var courts = await SportHub.Scheduling.Api.CourtBookingReportReader.ReadAsync(db, from, to, 3, null, default);
        Assert.Equal(courts.TotalBookings, courts.Daily.Sum(d => d.Bookings));
        Assert.Equal(courts.TotalBookedHours, courts.Daily.Sum(d => d.BookedHours));
        var export = await exports.CreateAsync(new() { ReportType = "COURT_BOOKINGS", FromDate = from, ToDate = to, SportId = 3, Columns = ["sportName", "bookings", "bookedHours"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        foreach (var row in courts.BySport) Assert.Contains($"{row.SportName},{row.Bookings},{row.BookedHours.ToString(CultureInfo.InvariantCulture)}", System.Text.Encoding.UTF8.GetString(bytes));
        var classes = await SportHub.Scheduling.Api.ClassStatusReportReader.ReadAsync(db, from, to, 3, default);
        Assert.All(classes.Classes, c => { Assert.Equal(3, c.SportId); Assert.InRange(c.StartDate, from, to); Assert.NotEqual("Cancelled", c.Status); });
        var classExport = await exports.CreateAsync(new() { ReportType = "CLASS_STATUS", FromDate = from, ToDate = to, SportId = 3, Columns = ["name", "status", "capacity", "confirmedCount"] }, manager.UserId);
        Assert.Equal("Completed", classExport.Status);
        Assert.Equal(classes.Classes.Count, classExport.RowCount);
    }
}
