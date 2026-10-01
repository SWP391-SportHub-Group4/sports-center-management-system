using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using System.Net;
using System.Net.Http.Json;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public class FullPaymentAndActivationTests(PaymentApiFactory factory)
{
    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private async Task<(Guid MemberId, Guid ReceptionistId, HttpClient FrontDesk)> SeedAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);

        return (member.UserId, receptionist.UserId,
            factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist));
    }

    [Theory]
    [InlineData("Cash", 999999)]
    [InlineData("Cash", 1000000)]
    [InlineData("Cash", 1000001)]
    [InlineData("Card", 1000000)]
    [InlineData("Transfer", 1000000)]
    [InlineData("EWallet", 1000000)]
    [InlineData("VnPay", 1000000)]
    public async Task Manual_payment_cannot_create_cash_or_activate_legacy_membership(string method, int amount)
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var (_, package) = await factory.SeedPendingPackageAsync(memberId);
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m, memberPackageId: package.MemberPackageId);
        var responses = await Task.WhenAll(
            frontDesk.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/payments", new { amount, method }),
            frontDesk.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/payments", new { amount, method }));
        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("checkout_requires_verified_payment", await response.Content.ReadAsStringAsync());
        }
        await factory.QueryAsync(async db =>
        {
            Assert.False(await db.Payments.AnyAsync(x => x.InvoiceId == invoice.InvoiceId));
            Assert.Equal(InvoiceStatus.Issued, await db.Invoices.Where(x => x.InvoiceId == invoice.InvoiceId).Select(x => x.Status).SingleAsync());
            Assert.Equal(MemberPackageStatus.PendingPayment, await db.MemberPackages.Where(x => x.MemberPackageId == package.MemberPackageId).Select(x => x.Status).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Response_khong_con_field_due_deposit()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);
        var detail = await ReadAsync<InvoiceDetailResponse>(await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));
        var json = System.Text.Json.JsonSerializer.Serialize(detail.Summary);
        Assert.DoesNotContain("dueDate", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("firstDeposit", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("overdue", json, StringComparison.OrdinalIgnoreCase);
    }
    [Fact]
    public async Task Legacy_discount_cannot_reduce_new_amount_due_or_activate_membership()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var (_, memberPackage) = await factory.SeedPendingPackageAsync(memberId);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, memberPackageId: memberPackage.MemberPackageId);

        var discount = await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 500_000m, reason = "Giảm giá trước khi thu" });
        Assert.Equal(HttpStatusCode.Conflict, discount.StatusCode);
        Assert.Contains("legacy_adjustment_read_only", await discount.Content.ReadAsStringAsync());

        var afterDiscount = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(3_000_000m, afterDiscount.Summary.Outstanding);

        var underpayment = await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 2_500_000m, method = "Cash" });
        Assert.Equal(HttpStatusCode.Conflict, underpayment.StatusCode);

        var activated = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.PendingPayment, activated.Status);
    }

    [Fact]
    public async Task Co_the_luu_nhieu_PaymentAttempt_cho_mot_Invoice()
    {
        var (memberId, receptionistId, _) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        await factory.QueryAsync(async db =>
        {
            db.PaymentAttempts.AddRange(
                new PaymentAttempt
                {
                    PaymentAttemptId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    VnpTxnRef = $"TXN-{Guid.NewGuid():N}",
                    Amount = 1_000_000m,
                    VnpExpireDate = DateTime.UtcNow.AddMinutes(15),
                    Status = PaymentAttemptStatus.Expired,
                    CreatedAt = DateTime.UtcNow.AddMinutes(-30)
                },
                new PaymentAttempt
                {
                    PaymentAttemptId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    VnpTxnRef = $"TXN-{Guid.NewGuid():N}",
                    Amount = 1_000_000m,
                    VnpExpireDate = DateTime.UtcNow.AddMinutes(15),
                    Status = PaymentAttemptStatus.Pending,
                    CreatedAt = DateTime.UtcNow
                });

            await db.SaveChangesAsync();
            return true;
        });

        var count = await factory.QueryAsync(async db => await db.PaymentAttempts
            .CountAsync(a => a.InvoiceId == invoice.InvoiceId));

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task Trung_VnpTxnRef_bi_chan_boi_unique_index()
    {
        var (memberId, receptionistId, _) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);
        var sharedRef = $"TXN-{Guid.NewGuid():N}";

        await factory.QueryAsync(async db =>
        {
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                VnpTxnRef = sharedRef,
                Amount = 1_000_000m,
                VnpExpireDate = DateTime.UtcNow.AddMinutes(15),
                Status = PaymentAttemptStatus.Pending,
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        await Assert.ThrowsAnyAsync<DbUpdateException>(() => factory.QueryAsync(async db =>
        {
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                VnpTxnRef = sharedRef,
                Amount = 1_000_000m,
                VnpExpireDate = DateTime.UtcNow.AddMinutes(15),
                Status = PaymentAttemptStatus.Pending,
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        }));
    }

    [Fact]
    public async Task VnpExpireDate_round_trip_dung_qua_PostgreSQL()
    {
        var (memberId, receptionistId, _) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);
        var expire = new DateTime(2026, 10, 1, 12, 34, 56, DateTimeKind.Utc);
        var attemptId = Guid.NewGuid();

        await factory.QueryAsync(async db =>
        {
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = attemptId,
                InvoiceId = invoice.InvoiceId,
                VnpTxnRef = $"TXN-{Guid.NewGuid():N}",
                Amount = 1_000_000m,
                VnpExpireDate = expire,
                Status = PaymentAttemptStatus.Pending,
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        var roundTripped = await factory.QueryAsync(async db => await db.PaymentAttempts
            .AsNoTracking()
            .Where(a => a.PaymentAttemptId == attemptId)
            .Select(a => a.VnpExpireDate)
            .SingleAsync());

        Assert.Equal(expire, roundTripped, TimeSpan.FromSeconds(1));
    }
}

