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
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ManagerPointGiftTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Class_filter_keeps_available_classes_and_excludes_cancelled_classes()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var ids = await factory.QueryAsync(async db => {
            var roomId = await db.Rooms.Select(r => r.RoomId).FirstAsync();
            var classes = new[] { ClassStatus.Draft, ClassStatus.Cancelled }.Select(status => new Class {
                Code = "GIFT-FILTER-" + Guid.NewGuid().ToString("N"), Name = "Gift filter " + status,
                SportId = 3, DefaultRoomId = roomId, Status = status, Capacity = 10,
                Price = 100_000, NumSessions = 1, StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
                CreatedAt = DateTime.UtcNow
            }).ToArray();
            db.Classes.AddRange(classes);
            await db.SaveChangesAsync();
            return classes.Select(c => c.ClassId).ToArray();
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var filters = await client.GetFromJsonAsync<JsonElement>("/api/manager/point-gifts/filters");
        var classIds = filters.GetProperty("classes").EnumerateArray().Select(c => c.GetProperty("classId").GetInt32()).ToArray();
        Assert.Contains(ids[0], classIds);
        Assert.DoesNotContain(ids[1], classIds);
    }

    [Fact]
    public async Task History_filters_names_and_complete_Vietnam_dates_before_paginating()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var otherManager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        var unique = Guid.NewGuid().ToString("N");
        var memberName = "History Member " + unique;
        var managerName = "History Manager " + unique;
        await factory.QueryAsync(async db => {
            (await db.UserProfiles.SingleAsync(p => p.UserId == member.UserId)).FullName = memberName;
            (await db.UserProfiles.SingleAsync(p => p.UserId == manager.UserId)).FullName = managerName;
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var otherClient = factory.CreateApiClient(otherManager.UserId, UserRole.CenterManager);
        var day = new DateOnly(2026, 11, 3);
        var start = VietnamTime.StartOfDayUtc(day);
        var end = VietnamTime.EndOfDayExclusiveUtc(day);
        async Task<Guid> Gift(HttpClient sender, Guid memberId, DateTime timestamp)
        {
            var batchId = Guid.NewGuid();
            (await sender.PostAsJsonAsync("/api/manager/point-gifts", new SendPointGifts {
                BatchId = batchId, Reason = "History filter coverage", Recipients = [new(memberId, 5)]
            })).EnsureSuccessStatusCode();
            return await factory.QueryAsync(async db => {
                var gift = await db.Set<SportHub.Payment.Wallet.Domain.PointGift>().SingleAsync(g => g.BatchId == batchId);
                gift.CreatedAtUtc = timestamp;
                await db.SaveChangesAsync();
                return gift.GiftId;
            });
        }
        await Gift(client, member.UserId, start.AddSeconds(-1));
        var first = await Gift(client, member.UserId, start);
        var last = await Gift(client, member.UserId, end.AddTicks(-10));
        await Gift(client, member.UserId, end);
        await Gift(otherClient, member.UserId, start);
        await Gift(client, otherMember.UserId, start);
        var names = $"member={Uri.EscapeDataString(memberName.ToUpperInvariant())}&manager={Uri.EscapeDataString(managerName.ToLowerInvariant())}";
        var dates = "fromDate=2026-11-03&toDate=2026-11-03";
        var result = await client.GetFromJsonAsync<JsonElement>($"/api/manager/point-gifts?{names}&{dates}&pageSize=1");
        Assert.Equal(2, result.GetProperty("totalCount").GetInt32());
        Assert.Equal(last, Assert.Single(result.GetProperty("items").EnumerateArray()).GetProperty("giftId").GetGuid());
        var next = await client.GetFromJsonAsync<JsonElement>($"/api/manager/point-gifts?{names}&{dates}&pageSize=1&page=2");
        Assert.Equal(first, Assert.Single(next.GetProperty("items").EnumerateArray()).GetProperty("giftId").GetGuid());
        var byEmail = await client.GetFromJsonAsync<JsonElement>($"/api/manager/point-gifts?member={Uri.EscapeDataString(member.Email)}&{dates}");
        Assert.Equal(3, byEmail.GetProperty("totalCount").GetInt32());
        var invalid = await client.GetAsync("/api/manager/point-gifts?fromDate=2026-11-04&toDate=2026-11-03");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Course_and_other_paid_purchases_qualify_and_sport_and_class_filters_match_purchased_items()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var courseBuyer = await factory.SeedUserAsync(UserRole.Member);
        var otherBuyer = await factory.SeedUserAsync(UserRole.Member);
        var unpaid = await factory.SeedUserAsync(UserRole.Member);
        var courseInvoice = await factory.SeedInvoiceAsync(courseBuyer.UserId, manager.UserId, 100_000);
        var otherInvoice = await factory.SeedInvoiceAsync(otherBuyer.UserId, manager.UserId, 100_000);
        var unpaidInvoice = await factory.SeedInvoiceAsync(unpaid.UserId, manager.UserId, 100_000);
        var classId = await factory.QueryAsync(async db => {
            var course = new Class { Code = "GIFT-" + Guid.NewGuid().ToString("N"), Name = "Gift filter course",
                SportId = 3, DefaultRoomId = await db.Rooms.Select(r => r.RoomId).FirstAsync(),
                Status = ClassStatus.Draft, Capacity = 10, Price = 100_000, NumSessions = 1,
                StartDate = DateOnly.FromDateTime(DateTime.UtcNow), CreatedAt = DateTime.UtcNow };
            db.Classes.Add(course);
            await db.SaveChangesAsync();
            foreach (var invoiceId in new[] { courseInvoice.InvoiceId, unpaidInvoice.InvoiceId }) {
                var item = await db.InvoiceItems.SingleAsync(i => i.InvoiceId == invoiceId);
                item.ItemType = InvoiceItemType.ClassPackage;
                item.ClassId = course.ClassId;
                // Legacy paid items can lack a sport snapshot; resolve it through the class.
                item.SportId = null;
            }
            var otherItem = await db.InvoiceItems.SingleAsync(i => i.InvoiceId == otherInvoice.InvoiceId);
            otherItem.ItemType = InvoiceItemType.WalletTopUp;
            foreach (var id in new[] { courseInvoice.InvoiceId, otherInvoice.InvoiceId })
                (await db.Invoices.SingleAsync(i => i.InvoiceId == id)).Status = InvoiceStatus.Paid;
            await db.SaveChangesAsync();
            return course.ClassId;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Task<Guid[]> Recipients(string query) => AllRecipientsAsync(client, query);
        Assert.Contains(courseBuyer.UserId, await Recipients(""));
        Assert.Contains(otherBuyer.UserId, await Recipients(""));
        Assert.Contains(unpaid.UserId, await Recipients(""));
        var unregistered = await Recipients("unregistered=true");
        Assert.Contains(unpaid.UserId, unregistered);
        Assert.DoesNotContain(courseBuyer.UserId, unregistered);
        Assert.DoesNotContain(otherBuyer.UserId, unregistered);
        Assert.Equal(new[] { courseBuyer.UserId }, await Recipients($"classId={classId}"));
        Assert.Contains(courseBuyer.UserId, await Recipients("sportId=3"));
        Assert.Empty(await Recipients($"sportId=2&classId={classId}"));
        var batch = new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "All paying members",
            Recipients = [new(courseBuyer.UserId, 5), new(otherBuyer.UserId, 5)] };
        (await client.PostAsJsonAsync("/api/manager/point-gifts", batch)).EnsureSuccessStatusCode();
        var accepted = await client.PostAsJsonAsync("/api/manager/point-gifts", new SendPointGifts {
            BatchId = Guid.NewGuid(), Reason = "Unpaid course", Recipients = [new(unpaid.UserId, 5)] });
        accepted.EnsureSuccessStatusCode();
    }

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
    public async Task Gift_limit_is_fixed_and_enforced_independently_of_payments()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var invoiceId = await PurchaseMembership(member.UserId);
        await factory.QueryAsync(async db => {
            await db.Payments.Where(p => p.InvoiceId == invoiceId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.PaidAt, DateTime.UtcNow.AddMonths(-1)));
            return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var limit = (await client.GetFromJsonAsync<PointGiftLimit>("/api/manager/point-gifts/limits"))!;
        Assert.Equal(10_000, limit.MaxPoints);
        var request = new SendPointGifts { BatchId = Guid.NewGuid(), Reason = "Member appreciation",
            Recipients = [new(member.UserId, 10_001)] };
        var denied = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Contains("point_gift_limit_exceeded", await denied.Content.ReadAsStringAsync());
        Assert.False(await factory.QueryAsync(db => db.Set<PointGift>().AnyAsync(g => g.BatchId == request.BatchId)));
        request.Recipients = [new(member.UserId, 10_000)];
        var accepted = await client.PostAsJsonAsync("/api/manager/point-gifts", request);
        Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync());
        Assert.Equal(10_000, await factory.QueryAsync(db => db.Set<PointGift>()
            .Where(g => g.BatchId == request.BatchId).Select(g => g.Points).SingleAsync()));
    }

    [Fact]
    public async Task Gift_recipients_include_members_without_purchases_and_send_accepts_them()
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
        await PurchaseMembership(dayPassOnly.UserId, dayPass: true);
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
        var ids = await AllRecipientsAsync(client);
        Assert.Contains(purchased.UserId, ids);
        Assert.Contains(expired.UserId, ids);
        Assert.Contains(unpaid.UserId, ids);
        Assert.Contains(dayPassOnly.UserId, ids);
        Assert.Contains(expiredDayPass.UserId, ids);
        Assert.Contains(unpaidDayPass.UserId, ids);
        Assert.Contains(neverPurchased.UserId, ids);
        Assert.DoesNotContain(manager.UserId, ids);
        foreach (var memberId in new[] { unpaid.UserId, unpaidDayPass.UserId, neverPurchased.UserId })
        {
            var response = await client.PostAsJsonAsync("/api/manager/point-gifts", new SendPointGifts {
                BatchId = Guid.NewGuid(), Reason = "Membership gift", Recipients = [new(memberId, 5)] });
            response.EnsureSuccessStatusCode();
            Assert.Equal(5, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == memberId)
                .Select(w => w.AvailablePoints).SingleAsync()));
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

    private static async Task<Guid[]> AllRecipientsAsync(HttpClient client, string query = "")
    {
        var all = new List<Guid>();
        var page = 1;
        while (true)
        {
            var separator = string.IsNullOrEmpty(query) ? "" : "&" + query;
            var data = await client.GetFromJsonAsync<JsonElement>($"/api/manager/point-gifts/recipients?page={page}&pageSize=100{separator}");
            var items = data.GetProperty("items").EnumerateArray().Select(r => r.GetProperty("memberId").GetGuid()).ToArray();
            all.AddRange(items);
            var total = data.GetProperty("totalCount").GetInt32();
            if (all.Count >= total || items.Length == 0) break;
            page++;
        }
        return all.ToArray();
    }
}
