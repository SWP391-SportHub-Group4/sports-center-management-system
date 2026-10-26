using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Controllers;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Application;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ManagerPointGiftTests(PaymentApiFactory factory)
{
    private async Task<Guid> PurchaseMembership(Guid memberId, MemberPackageStatus status = MemberPackageStatus.Active, bool dayPass = false)
    {
        var package = await factory.SeedPendingPackageAsync(memberId);
        var today = VietnamTime.TodayLocal(new SystemClock());
        await factory.QueryAsync(async db => {
            await db.MemberPackages.Where(p => p.MemberPackageId == package.MemberPackage.MemberPackageId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.PackageId, dayPass ? DayPass.PackageId : package.Catalog.PackageId)
                    .SetProperty(p => p.Status, status)
                    .SetProperty(p => p.StartDate, today.AddDays(-1)).SetProperty(p => p.EndDate, today.AddDays(30)));
            return 0;
        });
        var invoice = await factory.SeedInvoiceAsync(memberId, memberId, package.Catalog.Price, package.MemberPackage.MemberPackageId);
        await factory.QueryAsync(async db => {
            var paid = await db.Invoices.SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            paid.Status = InvoiceStatus.Paid;
            paid.PaidVia = "VnPay";
            paid.CashAmount = package.Catalog.Price;
            paid.PaidAtUtc = DateTime.UtcNow;
            db.Payments.Add(new SportHub.Payment.Domain.Entities.Payment {
                PaymentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId, Amount = package.Catalog.Price,
                Method = PaymentMethod.VnPay, Status = PaymentStatus.Success, ReceivedByUserId = memberId,
                ReferenceCode = Guid.NewGuid().ToString("N"), PaidAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        return invoice.InvoiceId;
    }

    [Fact]
    public async Task Gift_limit_matches_overview_net_collected_and_changes_with_real_payments()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var invoiceId = await PurchaseMembership(member.UserId);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var limit = (await client.GetFromJsonAsync<PointGiftLimit>("/api/manager/point-gifts/limits"))!;
        var report = await client.GetFromJsonAsync<JsonElement>($"/api/reports/revenue?fromDate={limit.FromDate:yyyy-MM-dd}&toDate={limit.ToDate:yyyy-MM-dd}");
        Assert.Equal(report.GetProperty("netRevenue").GetDecimal(), limit.NetCollectedVnd);
        Assert.Equal((int)decimal.Floor(Math.Max(0m, limit.NetCollectedVnd) / PointWalletService.VndPerPoint), limit.MaxPoints);
        var request = new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "Gift above current Net collected",
            Recipients = [new(member.UserId, limit.MaxPoints + 1)] };
        var denied = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Contains("point_gift_limit_exceeded", await denied.Content.ReadAsStringAsync());
        Assert.False(await factory.QueryAsync(db => db.Set<PointGift>().AnyAsync(g => g.BatchId == request.BatchId)));
        await factory.QueryAsync(async db => {
            await db.Payments.Where(p => p.InvoiceId == invoiceId).ExecuteUpdateAsync(s => s.SetProperty(p => p.Amount, p => p.Amount + PointWalletService.VndPerPoint));
            return 0;
        });
        var updated = (await client.GetFromJsonAsync<PointGiftLimit>("/api/manager/point-gifts/limits"))!;
        Assert.Equal(limit.NetCollectedVnd + PointWalletService.VndPerPoint, updated.NetCollectedVnd);
        Assert.Equal(limit.MaxPoints + 1, updated.MaxPoints);
        var accepted = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Gift_recipients_only_include_members_who_purchased_membership_and_send_rechecks_eligibility()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var purchased = await factory.SeedUserAsync(UserRole.Member);
        var expired = await factory.SeedUserAsync(UserRole.Member);
        var unpaid = await factory.SeedUserAsync(UserRole.Member);
        var dayPassOnly = await factory.SeedUserAsync(UserRole.Member);
        var expiredDayPass = await factory.SeedUserAsync(UserRole.Member);
        var unpaidDayPass = await factory.SeedUserAsync(UserRole.Member);
        var neverPurchased = await factory.SeedUserAsync(UserRole.Member);
        await PurchaseMembership(purchased.UserId);
        await PurchaseMembership(expired.UserId, MemberPackageStatus.Expired);
        await PurchaseMembership(expiredDayPass.UserId, MemberPackageStatus.Expired, dayPass: true);
        await factory.SeedPendingPackageAsync(unpaid.UserId);
        var pass = await factory.SeedPendingPackageAsync(dayPassOnly.UserId);
        var pendingPass = await factory.SeedPendingPackageAsync(unpaidDayPass.UserId);
        await factory.QueryAsync(async db => {
            await db.MemberPackages.Where(p => p.MemberPackageId == pass.MemberPackage.MemberPackageId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.PackageId, DayPass.PackageId)
                    .SetProperty(p => p.Status, MemberPackageStatus.Active));
            await db.MemberPackages.Where(p => p.MemberPackageId == pendingPass.MemberPackage.MemberPackageId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.PackageId, DayPass.PackageId));
            return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var data = await client.GetFromJsonAsync<JsonElement>("/api/manager/point-gifts/recipients?pageSize=100");
        var ids = data.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("memberId").GetGuid()).ToArray();
        Assert.Contains(purchased.UserId, ids);
        Assert.Contains(expired.UserId, ids);
        Assert.DoesNotContain(unpaid.UserId, ids);
        Assert.Contains(dayPassOnly.UserId, ids);
        Assert.Contains(expiredDayPass.UserId, ids);
        Assert.DoesNotContain(unpaidDayPass.UserId, ids);
        Assert.DoesNotContain(neverPurchased.UserId, ids);
        foreach (var memberId in new[] { unpaid.UserId, unpaidDayPass.UserId, neverPurchased.UserId })
        {
            var response = await client.PostAsJsonAsync("/api/manager/point-gifts", new SendPointGifts {
                BatchId = Guid.NewGuid(), Reason = "Membership gift", Recipients = [new(memberId, 5)] });
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("point_gift_recipient_ineligible", await response.Content.ReadAsStringAsync());
        }
        var gift = await client.PostAsJsonAsync("/api/manager/point-gifts", new SendPointGifts {
            BatchId = Guid.NewGuid(), Reason = "Day pass gift", Recipients = [new(dayPassOnly.UserId, 5)] });
        Assert.True(gift.IsSuccessStatusCode, await gift.Content.ReadAsStringAsync());
        Assert.Equal(5, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == dayPassOnly.UserId).Select(w => w.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Manager_gifts_to_multiple_members_immediately_and_retries_do_not_double_credit()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var a = await factory.SeedUserAsync(UserRole.Member);
        var b = await factory.SeedUserAsync(UserRole.Member);
        await PurchaseMembership(a.UserId);
        await PurchaseMembership(b.UserId);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "Member appreciation",
            Recipients = [new(a.UserId, 25), new(b.UserId, 10)] };
        var responses = await Task.WhenAll(client.PostAsJsonAsync("/api/manager/point-gifts", request),
            client.PostAsJsonAsync("/api/manager/point-gifts", request));
        foreach (var response in responses) Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var rows = await factory.QueryAsync(db => db.Set<PointGift>().Where(g => g.BatchId == request.BatchId).ToListAsync());
        Assert.Equal(2, rows.Count);
        Assert.All(rows, g => Assert.Equal(manager.UserId, g.ManagerId));
        Assert.Equal(25, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == a.UserId).Select(w => w.AvailablePoints).SingleAsync()));
        Assert.Equal(10, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == b.UserId).Select(w => w.AvailablePoints).SingleAsync()));
        var giftIds = rows.Select(g => g.GiftId).ToArray();
        Assert.Equal(4, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.SourceEntityId != null && giftIds.Contains(n.SourceEntityId.Value))));
        request.Reason = "Different gift with a reused key";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/manager/point-gifts", request)).StatusCode);
        var history = await client.GetAsync("/api/manager/point-gifts");
        history.EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    public async Task Other_roles_cannot_gift_points(UserRole role)
    {
        var actor = await factory.SeedUserAsync(role);
        using var client = factory.CreateApiClient(actor.UserId, role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/manager/point-gifts",
            new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "Unauthorized gift", Recipients = [new(actor.UserId, 5)] })).StatusCode);
    }

    [Fact]
    public async Task Invalid_member_in_batch_rolls_back_every_gift()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        await PurchaseMembership(member.UserId);
        await PurchaseMembership(inactive.UserId);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "Group gift",
            Recipients = [new(member.UserId, 5), new(inactive.UserId, 5)] };
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/manager/point-gifts", request)).StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Set<PointGift>().AnyAsync(g => g.BatchId == request.BatchId)));
        Assert.False(await factory.QueryAsync(db => db.PointLedgerEntries.AnyAsync(l => l.ActorUserId == manager.UserId)));
    }

    [Fact]
    public async Task Day_pass_gift_requires_agreement_and_incident_member_can_only_be_gifted_once()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await PurchaseMembership(member.UserId, dayPass: true);
        var day = VietnamTime.TodayLocal(new SystemClock());
        var incidentId = Guid.NewGuid();
        await factory.QueryAsync(async db => {
            db.Set<IncidentNotice>().Add(new IncidentNotice { IncidentId = incidentId, Scope = IncidentScope.Center,
                StartAtUtc = VietnamTime.StartOfDayUtc(day).AddHours(8), EndAtUtc = VietnamTime.StartOfDayUtc(day).AddHours(12),
                Reason = "Gym repairs", CreatedByUserId = manager.UserId, CreatedAtUtc = DateTime.UtcNow, ClosesGym = true,
                DayPassMembersJson = JsonSerializer.Serialize(new[] { new IncidentDayPassMember(Guid.NewGuid(), member.UserId,
                    "Day pass member", day, VietnamTime.StartOfDayUtc(day).AddHours(22)) }) });
            await db.SaveChangesAsync(); return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = new SendPointGifts { BatchId = Guid.NewGuid(), IncidentId = incidentId, Reason = "Member accepted points for Gym closure",
            Recipients = [new(member.UserId, 30)] };
        var noAgreement = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.Equal(HttpStatusCode.BadRequest, noAgreement.StatusCode);
        Assert.Contains("day_pass_gift_agreement_required", await noAgreement.Content.ReadAsStringAsync());
        request.Recipients = [new(member.UserId, 30, true)];
        (await client.PostAsJsonAsync("/api/manager/point-gifts", request)).EnsureSuccessStatusCode();
        request.BatchId = Guid.NewGuid();
        var duplicate = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("incident_member_already_gifted", await duplicate.Content.ReadAsStringAsync());
        Assert.Equal(30, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member.UserId).Select(w => w.AvailablePoints).SingleAsync()));
        (await client.PostAsync($"/api/manager/incidents/{incidentId}/day-pass-notice", null)).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/manager/incidents/{incidentId}/day-pass-notice", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.SourceEntityId == incidentId)));
        var options = await client.GetFromJsonAsync<JsonElement>($"/api/manager/point-gifts/recipients?incidentId={incidentId}");
        Assert.True(options.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("memberId").GetGuid() == member.UserId).GetProperty("alreadyGifted").GetBoolean());
    }
}
