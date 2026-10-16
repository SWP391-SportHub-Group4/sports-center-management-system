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
    public async Task Manager_wallet_reads_do_not_audit_and_only_committed_adjustments_are_logged_once()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var approver = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var reads = new[] {
            $"/api/manager/wallets/{owner.UserId}",
            $"/api/manager/wallets/{owner.UserId}/ledger",
            $"/api/manager/wallets/{owner.UserId}/ledger?page=2&entryType=ADJUSTMENT",
            $"/api/members/{owner.UserId}/points",
            $"/api/members/{owner.UserId}/points/ledger"
        };
        foreach (var path in reads.Concat(reads))
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(path)).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.AuditLogs.AnyAsync(a => a.UserId == manager.UserId
            && a.TargetId == owner.UserId.ToString())));
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
        var body = new { idempotencyKey = Guid.NewGuid(), points = 37, direction = "CREDIT", reason = "Approved correction" };
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments", body)).StatusCode);
        var pending = JsonDocument.Parse(await client.GetStringAsync("/api/point-credit-requests?status=Pending&page=1&pageSize=20")).RootElement;
        Assert.Contains(pending.GetProperty("items").EnumerateArray(), item =>
            item.GetProperty("requestId").GetGuid() == body.idempotencyKey
            && item.GetProperty("ownerName").GetString() == owner.Profile!.FullName);
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsync($"/api/point-credit-requests/{body.idempotencyKey}/approve", null)).StatusCode);
        using var secondManager = factory.CreateApiClient(approver.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.OK,
            (await secondManager.PostAsync($"/api/point-credit-requests/{body.idempotencyKey}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await secondManager.PostAsync($"/api/point-credit-requests/{body.idempotencyKey}/approve", null)).StatusCode);
        var balance = JsonDocument.Parse(await (await client.GetAsync($"/api/manager/wallets/{owner.UserId}")).Content.ReadAsStringAsync());
        Assert.Equal(37, balance.RootElement.GetProperty("availablePoints").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/manager/wallets/{owner.UserId}/ledger")).StatusCode);
        var logs = await factory.QueryAsync(db => db.AuditLogs.AsNoTracking()
            .Where(a => a.UserId == manager.UserId && a.TargetId == body.idempotencyKey.ToString()).ToListAsync());
        var requestLog = Assert.Single(logs);
        Assert.Equal("REQUEST_POINT_CREDIT", requestLog.Action);
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.UserId == approver.UserId
            && a.Action == "APPROVE_POINT_CREDIT" && a.TargetId == body.idempotencyKey.ToString())));
        Assert.Single(await factory.QueryAsync(db => db.PointLedgerEntries.AsNoTracking()
            .Where(e => e.ReferenceType == "ManagerAdjustment" && e.ReferenceId == body.idempotencyKey).ToListAsync()));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments",
            new { body.idempotencyKey, points = 38, direction = "CREDIT", body.reason })).StatusCode);
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.UserId == manager.UserId
            && a.TargetId == body.idempotencyKey.ToString())));
        foreach (var role in new[] { UserRole.Receptionist, UserRole.SystemAdministrator, UserRole.Member, UserRole.Coach })
        {
            var user = await factory.SeedUserAsync(role);
            using var denied = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await denied.GetAsync($"/api/manager/wallets/{owner.UserId}")).StatusCode);
        }
    }

    [Fact]
    public async Task Another_manager_can_reject_credit_without_minting_points()
    {
        var requester = await factory.SeedUserAsync(UserRole.CenterManager);
        var reviewer = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        using var first = factory.CreateApiClient(requester.UserId, UserRole.CenterManager);
        using var second = factory.CreateApiClient(reviewer.UserId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Accepted, (await first.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments",
            new { idempotencyKey = id, points = 200, direction = "CREDIT", reason = "Correction request" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.PostAsJsonAsync($"/api/point-credit-requests/{id}/reject",
            new { reason = "Not justified" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.PostAsJsonAsync($"/api/point-credit-requests/{id}/reject",
            new { reason = "Not justified" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await second.PostAsync($"/api/point-credit-requests/{id}/approve", null)).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
    }

    [Fact]
    public async Task Credit_request_from_a_deactivated_manager_cannot_be_approved()
    {
        var requester = await factory.SeedUserAsync(UserRole.CenterManager);
        var reviewer = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        using var first = factory.CreateApiClient(requester.UserId, UserRole.CenterManager);
        using var second = factory.CreateApiClient(reviewer.UserId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Accepted, (await first.PostAsJsonAsync($"/api/wallets/{owner.UserId}/adjustments",
            new { idempotencyKey = id, points = 200, direction = "CREDIT", reason = "Correction request" })).StatusCode);
        await factory.QueryAsync(db => db.UserAccounts.Where(u => u.UserId == requester.UserId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Deactivated)));
        var response = await second.PostAsync($"/api/point-credit-requests/{id}/approve", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("point_credit_requester_inactive", await response.Content.ReadAsStringAsync());
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
    }

    [Fact]
    public async Task Rejected_wallet_adjustments_do_not_write_audit_or_change_balance()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var owner = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var url = $"/api/wallets/{owner.UserId}/adjustments";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url,
            new { idempotencyKey = Guid.NewGuid(), points = 0, direction = "CREDIT", reason = "Invalid amount" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url,
            new { idempotencyKey = Guid.NewGuid(), points = 10, direction = "CREDIT", reason = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(url,
            new { idempotencyKey = Guid.NewGuid(), points = 1, direction = "DEBIT", reason = "Insufficient balance" })).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.AuditLogs.AnyAsync(a => a.UserId == manager.UserId
            && a.TargetId == owner.UserId.ToString())));
        using var balance = JsonDocument.Parse(await client.GetStringAsync($"/api/manager/wallets/{owner.UserId}"));
        Assert.Equal(0, balance.RootElement.GetProperty("availablePoints").GetInt32());
        Assert.False(await factory.QueryAsync(db => db.PointWallets.AnyAsync(w => w.OwnerUserId == owner.UserId)));
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
