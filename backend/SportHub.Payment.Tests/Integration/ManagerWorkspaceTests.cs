using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Administration.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ManagerWorkspaceTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Manager_wallet_is_read_only_and_legacy_mutations_are_forbidden()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var before = await client.GetStringAsync($"/api/manager/wallets/{owner.UserId}");
        foreach (var direction in new[] { "CREDIT", "DEBIT" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments",
                new { idempotencyKey = Guid.NewGuid(), points = 10, direction, reason = "Legacy manual adjustment" })).StatusCode);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/point-credit-requests/{id}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/point-credit-requests/{id}/reject", new { reason = "Legacy request" })).StatusCode);
        using var previous = JsonDocument.Parse(before);
        using var after = JsonDocument.Parse(await client.GetStringAsync($"/api/manager/wallets/{owner.UserId}"));
        Assert.Equal(previous.RootElement.GetProperty("availablePoints").GetInt32(), after.RootElement.GetProperty("availablePoints").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/manager/wallets/{owner.UserId}/ledger")).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
        Assert.False(await factory.QueryAsync(db => db.AuditLogs.AnyAsync(a => a.UserId == manager.UserId && a.Action.Contains("POINT"))));
    }

    [Fact]
    public async Task Audit_actor_filter_applies_before_pagination_and_admin_receives_manager_operational_events()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var classAuditId = Guid.NewGuid();
        var walletId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.AuditLogs.AddRange(
                new SportHub.Audit.Domain.Entities.AuditLog { AuditId = classAuditId, UserId = manager.UserId, Action = "PUBLISH_CLASS", TargetEntity = "Class", TargetId = "1", Timestamp = DateTime.UtcNow },
                new SportHub.Audit.Domain.Entities.AuditLog { AuditId = walletId, UserId = manager.UserId, Action = "ADJUST_POINTS", TargetEntity = "PointWallet", TargetId = admin.UserId.ToString(), Timestamp = DateTime.UtcNow });
            return await db.SaveChangesAsync();
        });
        using var staff = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var all = JsonDocument.Parse(await (await staff.GetAsync($"/api/audit-logs?actorId={manager.UserId}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, all.GetProperty("totalCount").GetInt32());
        using var limited = factory.CreateApiClient(admin.UserId, UserRole.SystemAdministrator);
        var visible = JsonDocument.Parse(await (await limited.GetAsync($"/api/audit-logs?actorId={manager.UserId}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, visible.GetProperty("totalCount").GetInt32());
        Assert.Contains(visible.GetProperty("items").EnumerateArray(), item => item.GetProperty("auditId").GetGuid() == classAuditId);
        Assert.Contains(visible.GetProperty("items").EnumerateArray(), item => item.GetProperty("auditId").GetGuid() == walletId);
        var walletEvents = JsonDocument.Parse(await (await limited.GetAsync($"/api/audit-logs?actorId={manager.UserId}&targetEntity=PointWallet")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, walletEvents.GetProperty("totalCount").GetInt32());
        Assert.Equal(walletId, walletEvents.GetProperty("items")[0].GetProperty("auditId").GetGuid());
        var paged = JsonDocument.Parse(await (await limited.GetAsync($"/api/audit-logs?actorId={manager.UserId}&pageSize=1")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, paged.GetProperty("totalCount").GetInt32());
        Assert.Single(paged.GetProperty("items").EnumerateArray());
    }





    [Fact]
    public async Task Dimensional_api_and_export_preserve_all_filters_and_admin_is_denied_revenue()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var from = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7)).AddDays(-30);
        var to = from.AddDays(31);
        var report = await scope.ServiceProvider.GetRequiredService<IRevenueReportService>().GetAsync(from, to);
        var rental = Assert.Single(report.BySportAndSource.Where(r => r.Source == "Rental").Take(1));
        var exports = scope.ServiceProvider.GetRequiredService<IReportExportService>();
        var export = await exports.CreateAsync(new() { ReportType = "REVENUE_DIMENSIONS", FromDate = from, ToDate = to,
            SportId = rental.SportId, Source = "RENTAL", MemberId = rental.MemberId,
            Columns = ["source", "sportId", "memberId", "collectedAmount", "pointsRedeemedVnd"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        Assert.Contains("RENTAL", export.ParametersJson);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        Assert.Contains(rental.MemberId!.Value.ToString(), csv);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetAsync($"/api/reports/revenue-dimensions?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}&sportId={rental.SportId}&source=RENTAL&memberId={rental.MemberId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(export.RowCount, json.GetProperty("rows").GetArrayLength());
        Assert.Equal(rental.CashCollected, json.GetProperty("cashCollected").GetDecimal());
        Assert.Equal(rental.PointsRedeemed * 1000m, json.GetProperty("pointsRedeemedVnd").GetDecimal());
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        using var denied = factory.CreateApiClient(admin.UserId, UserRole.SystemAdministrator);
        Assert.Equal(HttpStatusCode.Forbidden, (await denied.GetAsync($"/api/reports/revenue-dimensions?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}")).StatusCode);
    }
}
