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
