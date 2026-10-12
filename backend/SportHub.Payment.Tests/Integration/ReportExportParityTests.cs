using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Services;
using SportHub.Payment.Application.Interfaces;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ReportExportParityTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Summary_export_separates_period_points_from_timestamped_current_balance()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var from = new DateOnly(2000, 1, 1);
        var started = DateTime.UtcNow;
        var report = await scope.ServiceProvider.GetRequiredService<IRevenueReportService>().GetAsync(from, from);
        Assert.Equal(0, report.TotalCollected);
        Assert.Equal(0, report.PointsRedeemed);
        Assert.Equal(0, report.PointsIssued);
        Assert.InRange(report.OutstandingPointsAsOfUtc, started, DateTime.UtcNow);
        var exports = scope.ServiceProvider.GetRequiredService<SportHub.Administration.Application.Interfaces.IReportExportService>();
        var export = await exports.CreateAsync(new() { ReportType = "REVENUE_SUMMARY", FromDate = from,
            ToDate = from, Columns = ["collectedAmount", "pointsRedeemed", "pointsIssued", "outstandingPoints", "outstandingPointsAsOfUtc"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        Assert.Contains("collectedAmount,pointsRedeemed,pointsIssued,outstandingPoints,outstandingPointsAsOfUtc", csv);
        Assert.Contains($"0,0,0,{report.OutstandingPoints},", csv);
    }

    [Fact]
    public async Task Class_export_preserves_sport_filter_and_matches_api_rows()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var from = DateOnly.FromDateTime(SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(DateTime.UtcNow));
        var report = await scope.ServiceProvider.GetRequiredService<SportHub.Scheduling.Application.Interfaces.IClassEnrollmentReportService>()
            .GetAsync(from, from.AddDays(30), 3);
        Assert.NotEmpty(report.Classes);
        var exports = scope.ServiceProvider.GetRequiredService<SportHub.Administration.Application.Interfaces.IReportExportService>();
        var export = await exports.CreateAsync(new() { ReportType = "CLASS_ENROLLMENT", FromDate = from,
            ToDate = from.AddDays(30), SportId = 3, Columns = ["classId", "sportId", "confirmedCount", "activeHoldCount"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        Assert.Equal(report.Classes.Count, export.RowCount);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        foreach (var row in report.Classes)
            Assert.Contains($"{row.ClassId},{row.SportId},{row.ConfirmedCount},{row.ActiveHoldCount}", csv);
    }

    [Fact]
    public async Task Daily_csv_uses_same_period_and_cash_totals_as_api_service()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var from = new DateOnly(2026, 10, 1);
        var to = from.AddDays(2);
        var report = await scope.ServiceProvider.GetRequiredService<IRevenueReportService>().GetAsync(from, to);
        var exports = scope.ServiceProvider.GetRequiredService<SportHub.Administration.Application.Interfaces.IReportExportService>();
        var export = await exports.CreateAsync(new() { ReportType = "REVENUE_DAILY", FromDate = from,
            ToDate = to, Columns = ["date", "collectedAmount", "netCollected"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        foreach (var row in report.Daily)
            Assert.Contains($"{row.Date:yyyy-MM-dd},{row.Collected.ToString(CultureInfo.InvariantCulture)},{row.Net.ToString(CultureInfo.InvariantCulture)}", csv);
        Assert.Equal(report.Daily.Count, export.RowCount);
    }

    [Theory]
    [InlineData("REVENUE_DIMENSIONS")]
    [InlineData("COURT_RENTAL_REVENUE")]
    public async Task Dimension_export_uses_member_names_without_changing_financial_rows(string reportType)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var today = DateOnly.FromDateTime(SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(DateTime.UtcNow));
        var from = today.AddDays(-30);
        var report = await scope.ServiceProvider.GetRequiredService<IRevenueReportService>().GetAsync(from, today);
        var rows = SportHub.Payment.Application.Services.RevenueDimensionFilter.Apply(
            report.BySportAndSource, rentalsOnly: reportType == "COURT_RENTAL_REVENUE");
        Assert.Contains(rows, row => row.MemberId.HasValue);
        var ids = rows.Where(row => row.MemberId.HasValue).Select(row => row.MemberId!.Value).ToArray();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var names = await db.UserAccounts.Where(user => ids.Contains(user.UserId))
            .Select(user => new { user.UserId, Name = user.Profile!.FullName })
            .ToDictionaryAsync(user => user.UserId, user => user.Name);
        var exports = scope.ServiceProvider.GetRequiredService<SportHub.Administration.Application.Interfaces.IReportExportService>();
        var export = await exports.CreateAsync(new()
        {
            ReportType = reportType, FromDate = from, ToDate = today,
            Columns = ["source", "memberName", "collectedAmount", "pointsRedeemed"]
        }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        Assert.Equal(rows.Count, export.RowCount);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        Assert.Contains("source,memberName,collectedAmount,pointsRedeemed", csv);
        foreach (var row in rows)
        {
            var name = row.MemberId is Guid id ? names[id] : "";
            var csvName = name.Contains(',') || name.Contains('"') ? $"\"{name.Replace("\"", "\"\"")}\"" : name;
            Assert.Contains($"{SportHub.Administration.Domain.Entities.ReportColumnLabels.SourceName(row.Source)},{csvName},{row.CashCollected.ToString(CultureInfo.InvariantCulture)},{row.PointsRedeemed}", csv);
            if (row.MemberId is Guid memberId) Assert.DoesNotContain(memberId.ToString(), csv);
        }
    }

    [Fact]
    public async Task Demo_seed_repeat_does_not_duplicate_wallet_credit_or_paid_rental()
    {
        var before = await factory.QueryAsync(async db => new {
            Ledger = await db.PointLedgerEntries.CountAsync(), Rentals = await db.Set<SportHub.Scheduling.Rental.Domain.CourtRental>().CountAsync() });
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedAsync();
        var after = await factory.QueryAsync(async db => new {
            Ledger = await db.PointLedgerEntries.CountAsync(), Rentals = await db.Set<SportHub.Scheduling.Rental.Domain.CourtRental>().CountAsync() });
        Assert.Equal(before, after);
        Assert.True(await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Rental.Domain.CourtRental>()
            .AnyAsync(x => x.Status == SportHub.Scheduling.Rental.Domain.CourtRentalStatus.Confirmed && x.InvoiceItemId != null)));
    }
}
