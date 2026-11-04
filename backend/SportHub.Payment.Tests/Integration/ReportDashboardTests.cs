using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Administration.Application.Interfaces;
using System.Globalization;
using System.Net.Http.Json;
using SportHub.BuildingBlocks.Abstractions.Reporting;
using SportHub.Scheduling.Rental.Domain;

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
            var requestId = Guid.NewGuid();
            db.Set<MemberSupportRequest>().Add(new()
            {
                RequestId = requestId, MemberId = member.UserId, RecordedByUserId = member.UserId,
                InvoiceId = invoice.InvoiceId, InvoiceItemId = item.ItemId, Category = "PAYMENT",
                Subject = "Reporting refund", Description = "Recorded bank transfer", CreatedAt = at,
                SlaDueAtUtc = at.AddDays(2)
            });
            db.Set<MemberSupportPayout>().Add(new()
            {
                PayoutId = Guid.NewGuid(), RequestId = requestId, InvoiceId = invoice.InvoiceId,
                InvoiceItemId = item.ItemId, Amount = 100_000m, RecordedByUserId = manager.UserId,
                RecordedAtUtc = at.AddHours(2)
            });
            await db.SaveChangesAsync(); return true;
        });
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IRevenueReportService>();
        var report = await service.GetAsync(day, day, sportId: sport, source: "RENTAL", memberId: member.UserId);
        Assert.Equal(600_000m, report.TotalCollected);
        Assert.Equal(100_000m, report.TotalRefunded);
        Assert.Equal(500_000m, report.NetRevenue);
        Assert.Equal(50, report.PointsRefunded);
        Assert.Equal(1, report.RefundCount);
        Assert.Equal(100_000m, report.BankRefundPaid);
        Assert.Equal(report.TotalCollected, report.BySource.Sum(r => r.CashCollected));
        Assert.Equal(report.TotalCollected, report.BySportAndSource.Sum(r => r.CashCollected));
        Assert.Equal(report.NetRevenue, report.Daily.Sum(r => r.Net));
        Assert.Equal(report.PointsIssued, report.Daily.Sum(r => r.PointsIssued));
        Assert.Equal(report.PointsRedeemed, report.Daily.Sum(r => r.PointsRedeemed));
        Assert.Equal(report.PointsRefunded, report.Daily.Sum(r => r.PointsRefunded));
        var outside = await service.GetAsync(day.AddDays(-1), day.AddDays(-1), memberId: member.UserId);
        Assert.Equal(0, outside.TotalCollected);
        var excluded = await service.GetAsync(day, day, source: "WALLET_TOP_UP", memberId: member.UserId);
        Assert.Equal(0, excluded.TotalRefunded);
        Assert.Equal(0, excluded.RefundCount);
        Assert.Equal(0, excluded.BankRefundPaid);
        var exports = scope.ServiceProvider.GetRequiredService<IReportExportService>();
        foreach (var type in new[] { "REVENUE_SUMMARY", "REVENUE_DAILY" })
        {
            var export = await exports.CreateAsync(new() { ReportType = type, FromDate = day, ToDate = day, SportId = sport, Source = "RENTAL", MemberId = member.UserId, Columns = ["collectedAmount", "refundedAmount", "netCollected"] }, manager.UserId);
            Assert.Equal("Completed", export.Status);
            var (name, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
            Assert.Contains("2011-03-12", name);
            var values = System.Text.Encoding.UTF8.GetString(bytes).Split('\n', StringSplitOptions.RemoveEmptyEntries)[1]
                .Trim().Split(',').Select(value => decimal.Parse(value, CultureInfo.InvariantCulture)).ToArray();
            Assert.Equal(new[] { 600_000m, 100_000m, 500_000m }, values);
        }
        var pdf = await exports.CreateAsync(new() { ReportType = "REVENUE_SUMMARY", FromDate = day, ToDate = day, SportId = sport, Source = "RENTAL", MemberId = member.UserId, Format = "Pdf", Columns = ["collectedAmount", "refundedAmount", "netCollected"] }, manager.UserId);
        Assert.Equal("Completed", pdf.Status);
        var (_, pdfBytes) = await exports.DownloadAsync(pdf.ReportExportId, manager.UserId, true);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(pdfBytes));
    }

    [Fact]
    public async Task Paid_rental_reports_include_every_rental_status_and_keep_rental_dates_filters_and_exports_consistent()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        var from = new DateOnly(2041, 4, 1);
        var to = from.AddMonths(1).AddDays(-1);
        var day = from.AddDays(4);
        var at = VietnamTime.StartOfDayUtc(day).AddHours(10);
        var sportId = await factory.QueryAsync(async db =>
        {
            var sports = await db.Sports.OrderBy(s => s.SportId).Select(s => s.SportId).Take(2).ToArrayAsync();
            var roomId = await db.Rooms.Select(r => r.RoomId).FirstAsync();
            void Add(CourtRentalStatus status, InvoiceStatus invoiceStatus, DateTime start,
                Guid owner, int sport, bool historicalPayment = false, bool legacyLink = false)
            {
                var invoice = new Invoice
                {
                    InvoiceId = Guid.NewGuid(), InvoiceNumber = $"PAID-RENTAL-{Guid.NewGuid():N}",
                    MemberId = owner, IssuedByUserId = manager.UserId, TotalAmount = 100_000,
                    Status = invoiceStatus, IssuedAt = at.AddMonths(-1),
                    PaidAtUtc = historicalPayment ? at.AddMonths(-1) : null,
                    PointsApplied = invoiceStatus == InvoiceStatus.Paid ? 100 : 0
                };
                var item = new InvoiceItem
                {
                    ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                    ItemType = InvoiceItemType.Rental, Description = "Reporting rental",
                    Quantity = 1, UnitPrice = 100_000, LineAmount = 100_000
                };
                invoice.Items.Add(item);
                db.Invoices.Add(invoice);
                db.Set<CourtRental>().Add(new()
                {
                    CourtRentalId = Guid.NewGuid(), MemberId = owner, SportId = sport,
                    RoomId = roomId, StartAtUtc = start, EndAtUtc = start.AddMinutes(90),
                    TotalPrice = 100_000, CreatedAtUtc = at.AddMonths(-1), Status = status,
                    InvoiceId = legacyLink ? null : invoice.InvoiceId,
                    InvoiceItemId = status == CourtRentalStatus.PendingPayment ? null : item.ItemId
                });
            }
            foreach (var status in Enum.GetValues<CourtRentalStatus>())
                Add(status, InvoiceStatus.Paid, at, member.UserId, sports[0]);
            Add(CourtRentalStatus.PendingPayment, InvoiceStatus.PaidAfterReconciliation, at, member.UserId, sports[0]);
            Add(CourtRentalStatus.Cancelled, InvoiceStatus.Void, at, member.UserId, sports[0], historicalPayment: true, legacyLink: true);
            foreach (var status in Enum.GetValues<CourtRentalStatus>())
                Add(status, InvoiceStatus.Issued, at, member.UserId, sports[0]);
            Add(CourtRentalStatus.Cancelled, InvoiceStatus.Void, at, member.UserId, sports[0]);
            Add(CourtRentalStatus.Confirmed, InvoiceStatus.Paid, VietnamTime.StartOfDayUtc(from).AddTicks(-1), member.UserId, sports[0]);
            Add(CourtRentalStatus.Confirmed, InvoiceStatus.Paid, VietnamTime.StartOfDayUtc(to.AddDays(1)), member.UserId, sports[0]);
            Add(CourtRentalStatus.Confirmed, InvoiceStatus.Paid, at, otherMember.UserId, sports[0]);
            Add(CourtRentalStatus.Confirmed, InvoiceStatus.Paid, at, member.UserId, sports[1]);
            await db.SaveChangesAsync();
            return sports[0];
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var report = await client.GetFromJsonAsync<SportHub.Scheduling.Api.CourtBookingReport>(
            $"api/reports/court-bookings?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}&sportId={sportId}&memberId={member.UserId}");
        Assert.NotNull(report);
        Assert.Equal(8, report.TotalBookings);
        Assert.Equal(12m, report.TotalBookedHours);
        Assert.Equal(report.TotalBookings, report.Daily.Sum(d => d.Bookings));
        Assert.Equal(report.TotalBookedHours, report.Daily.Sum(d => d.BookedHours));
        Assert.Equal(8, report.Daily.Single(d => d.Date == day).Bookings);
        Assert.Equal(8, Assert.Single(report.BySport).Bookings);
        Assert.All(report.Daily.Where(d => d.Date != day), d => Assert.Equal(0, d.Bookings));
        using var scope = factory.Services.CreateScope();
        var exports = scope.ServiceProvider.GetRequiredService<IReportExportService>();
        var export = await exports.CreateAsync(new()
        {
            ReportType = "COURT_BOOKINGS", FromDate = from, ToDate = to,
            SportId = sportId, MemberId = member.UserId, Columns = ["sportName", "bookings", "bookedHours"]
        }, manager.UserId);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        Assert.Contains("sportName,bookings,bookedHours", csv);
        Assert.Equal("Paid bookings", SportHub.Administration.Domain.Entities.ReportColumnLabels.For("bookings"));
        Assert.Contains($"{report.BySport[0].SportName},8,12", csv);
    }

    [Fact]
    public async Task Court_reports_include_all_active_sports_even_without_rental_offerings_or_bookings()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var ids = await factory.QueryAsync(async db =>
        {
            var sports = Enumerable.Range(0, 3).Select(index => new SportHub.Scheduling.Catalog.Domain.Sport
            {
                Code = "report-" + Guid.NewGuid().ToString("N")[..10],
                Name = $"New report sport {index} {Guid.NewGuid():N}",
                IsActive = index < 2,
                Services = [new()
                {
                    ServiceType = SportHub.BuildingBlocks.Abstractions.Scheduling.SportServiceType.GroupCourse,
                    IsEnabled = true, DefaultSessionMinutes = 60, DefaultMaxCapacity = 12
                }]
            }).ToArray();
            db.Sports.AddRange(sports);
            await db.SaveChangesAsync();
            return sports.Select(s => s.SportId).ToArray();
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var path = $"api/reports/court-bookings?fromDate=2042-03-01&toDate=2042-03-31&memberId={member.UserId}";
        var report = await client.GetFromJsonAsync<SportHub.Scheduling.Api.CourtBookingReport>(path);
        Assert.NotNull(report);
        Assert.Equal(0, report.TotalBookings);
        Assert.All(report.BySport, row => { Assert.Equal(0, row.Bookings); Assert.Equal(0, row.BookedHours); });
        Assert.Contains(report.BySport, row => row.SportId == ids[0]);
        Assert.Contains(report.BySport, row => row.SportId == ids[1]);
        Assert.DoesNotContain(report.BySport, row => row.SportId == ids[2]);
        Assert.True(report.BySport.Count > 2);
        var filtered = await client.GetFromJsonAsync<SportHub.Scheduling.Api.CourtBookingReport>($"{path}&sportId={ids[0]}");
        Assert.NotNull(filtered);
        Assert.Equal(ids[0], Assert.Single(filtered.BySport).SportId);
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
        var courts = await SportHub.Scheduling.Api.CourtBookingReportReader.ReadAsync(db,
            scope.ServiceProvider.GetRequiredService<IPaidInvoiceReportReader>(), from, to, 3, null, default);
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
