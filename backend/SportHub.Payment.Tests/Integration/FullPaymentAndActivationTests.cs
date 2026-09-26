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

    [Fact]
    public async Task Tra_thieu_bi_tu_choi()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 3_000_000m);

        var response = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 2_999_999m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("payment_exceeds_invoice_balance", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Tra_thua_bi_tu_choi()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var response = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000_001m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("payment_exceeds_invoice_balance", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Tra_dung_toan_bo_duoc_chap_nhan_va_chuyen_Paid()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 3_000_000m);

        var afterPayment = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 3_000_000m, method = "Cash" }));

        Assert.Equal("Paid", afterPayment.Summary.Status);
        Assert.Equal(0m, afterPayment.Summary.Outstanding);
    }

    [Fact]
    public async Task Thanh_toan_thanh_cong_tao_dung_mot_Payment()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var paymentCount = await factory.QueryAsync(async db => await db.Set<Domain.Entities.Payment>()
            .CountAsync(p => p.InvoiceId == invoice.InvoiceId));

        Assert.Equal(1, paymentCount);
    }

    [Fact]
    public async Task MemberPackage_chi_Active_sau_khi_thanh_toan_du()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var (catalog, memberPackage) = await factory.SeedPendingPackageAsync(
            memberId, price: 3_000_000m, durationDays: 90);

        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, memberPackageId: memberPackage.MemberPackageId);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 3_000_000m, method = "Cash" }));

        var activated = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.Active, activated.Status);
        Assert.Equal(catalog.SessionLimit, activated.RemainingSessions);
        Assert.Equal(activated.StartDate.AddDays(catalog.DurationDays - 1), activated.EndDate);
    }

    [Fact]
    public async Task Thanh_toan_lan_hai_tren_hoa_don_da_Paid_bi_tu_choi()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var second = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000_000m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var paymentCount = await factory.QueryAsync(async db => await db.Set<Domain.Entities.Payment>()
            .CountAsync(p => p.InvoiceId == invoice.InvoiceId
                              && p.Status == Domain.Enums.PaymentStatus.Success));

        Assert.Equal(1, paymentCount);
    }

    [Fact]
    public async Task Hai_khoan_thu_dong_thoi_khong_vuot_tran()
    {
        var (memberId, receptionistId, _) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var clientA = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var clientB = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var body = new { amount = 1_000_000m, method = "Cash" };

        await Task.WhenAll(
            clientA.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/payments", body),
            clientB.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/payments", body));

        var collected = await factory.QueryAsync(async db => await db.Set<Domain.Entities.Payment>()
            .Where(p => p.InvoiceId == invoice.InvoiceId
                        && p.Status == Domain.Enums.PaymentStatus.Success)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m);

        Assert.Equal(1_000_000m, collected);
    }

    [Fact]
    public async Task Response_khong_con_field_due_deposit()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var afterPayment = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var json = System.Text.Json.JsonSerializer.Serialize(afterPayment.Summary);

        Assert.DoesNotContain("dueDate", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("firstDeposit", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("overdue", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Discount_truoc_khi_thu_roi_tra_du_van_kich_hoat_goi()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var (_, memberPackage) = await factory.SeedPendingPackageAsync(memberId);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, memberPackageId: memberPackage.MemberPackageId);

        var discount = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 500_000m, reason = "Giảm giá trước khi thu" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{discount.AdjustmentId}/approve",
                new { reason = "Duyệt giảm giá" }));

        var afterDiscount = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(2_500_000m, afterDiscount.Summary.Outstanding);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 2_500_000m, method = "Cash" }));

        var activated = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.Active, activated.Status);
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
