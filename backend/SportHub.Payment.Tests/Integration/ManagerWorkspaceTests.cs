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
    public async Task Audit_actor_filter_applies_before_pagination_and_admin_only_receives_account_events()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var accountId = Guid.NewGuid();
        var walletId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.AuditLogs.AddRange(
                new SportHub.Audit.Domain.Entities.AuditLog { AuditId = accountId, UserId = manager.UserId, Action = "LOCK_USER", TargetEntity = "UserAccount", TargetId = admin.UserId.ToString(), Timestamp = DateTime.UtcNow },
                new SportHub.Audit.Domain.Entities.AuditLog { AuditId = walletId, UserId = manager.UserId, Action = "ADJUST_POINTS", TargetEntity = "PointWallet", TargetId = admin.UserId.ToString(), Timestamp = DateTime.UtcNow });
            return await db.SaveChangesAsync();
        });
        using var staff = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var all = JsonDocument.Parse(await (await staff.GetAsync($"/api/audit-logs?actorId={manager.UserId}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, all.GetProperty("totalCount").GetInt32());
        using var limited = factory.CreateApiClient(admin.UserId, UserRole.SystemAdministrator);
        var accounts = JsonDocument.Parse(await (await limited.GetAsync($"/api/audit-logs?actorId={manager.UserId}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, accounts.GetProperty("totalCount").GetInt32());
        Assert.Equal(accountId, accounts.GetProperty("items")[0].GetProperty("auditId").GetGuid());
        var deniedScope = JsonDocument.Parse(await (await limited.GetAsync($"/api/audit-logs?actorId={manager.UserId}&targetEntity=PointWallet")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(0, deniedScope.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task External_wallet_lookup_is_manager_only_audited_and_adjustment_retry_is_idempotent()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.ExternalCoach);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/manager/wallets/{owner.UserId}")).StatusCode);
        var body = new { idempotencyKey = Guid.NewGuid(), points = 37, direction = "CREDIT", reason = "Approved correction" };
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments", body)).StatusCode);
        var balance = JsonDocument.Parse(await (await client.GetAsync($"/api/manager/wallets/{owner.UserId}")).Content.ReadAsStringAsync());
        Assert.Equal(37, balance.RootElement.GetProperty("availablePoints").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/manager/wallets/{owner.UserId}/ledger")).StatusCode);
        Assert.True(await factory.QueryAsync(db => db.AuditLogs.AnyAsync(a => a.Action == "VIEW_OWNER_WALLET" && a.UserId == manager.UserId && a.TargetId == owner.UserId.ToString())));
        foreach (var role in new[] { UserRole.Receptionist, UserRole.SystemAdministrator, UserRole.Member, UserRole.Coach, UserRole.ExternalCoach })
        {
            var user = await factory.SeedUserAsync(role);
            using var denied = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await denied.GetAsync($"/api/manager/wallets/{owner.UserId}")).StatusCode);
        }
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
            SportId = rental.SportId, Source = "RENTAL", ExternalCoachId = rental.ExternalCoachId,
            Columns = ["source", "sportId", "externalCoachId", "collectedAmount", "pointsRedeemedVnd"] }, manager.UserId);
        Assert.Equal("Completed", export.Status);
        Assert.Contains("RENTAL", export.ParametersJson);
        var (_, bytes) = await exports.DownloadAsync(export.ReportExportId, manager.UserId, true);
        var csv = System.Text.Encoding.UTF8.GetString(bytes);
        Assert.Contains(rental.ExternalCoachId!.Value.ToString(), csv);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetAsync($"/api/reports/revenue-dimensions?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}&sportId={rental.SportId}&source=RENTAL&externalCoachId={rental.ExternalCoachId}");
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
