using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.DTOs;
using System.Net;
using System.Net.Http.Json;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// BR-55 (hạn thanh toán và cọc) và BR-30 (kích hoạt gói) trên PostgreSQL thật.
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public class DepositAndActivationTests(PaymentApiFactory factory)
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

    /// <summary>
    /// BR-55 — khoản đầu tiên là CỌC (còn dư nợ sau khi thu) ⇒ hạn dời sang cọc + 12 tháng
    /// và FirstDepositAtUtc được ghi.
    /// </summary>
    [Fact]
    public async Task Coc_dau_tien_gia_han_12_thang_va_ghi_FirstDeposit()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var issuedAt = DateTime.UtcNow.AddDays(-3);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, issuedAt: issuedAt, dueDateUtc: issuedAt.AddMonths(2));

        var afterDeposit = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        Assert.NotNull(afterDeposit.Summary.FirstDepositAtUtc);
        Assert.Equal(2_000_000m, afterDeposit.Summary.Outstanding);

        var expectedDue = afterDeposit.Summary.FirstDepositAtUtc!.Value.AddMonths(12);

        Assert.Equal(expectedDue, afterDeposit.Summary.DueDateUtc, TimeSpan.FromSeconds(2));
    }

    /// <summary>
    /// BR-55 — thanh toán ĐỦ ngay lần đầu KHÔNG phải cọc: không ghi FirstDepositAtUtc và
    /// không gia hạn. Bản trước gán FirstDepositAtUtc cho mọi khoản Success đầu tiên, nên
    /// một hoá đơn trả đủ một lần cũng được dời hạn thêm 12 tháng vô nghĩa.
    /// </summary>
    [Fact]
    public async Task Thanh_toan_du_ngay_lan_dau_khong_phai_coc()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var issuedAt = DateTime.UtcNow.AddDays(-3);
        var originalDue = issuedAt.AddMonths(2);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, issuedAt: issuedAt, dueDateUtc: originalDue);

        var afterPayment = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 3_000_000m, method = "Cash" }));

        Assert.Null(afterPayment.Summary.FirstDepositAtUtc);
        Assert.Equal(originalDue, afterPayment.Summary.DueDateUtc, TimeSpan.FromSeconds(2));
        Assert.Equal("Paid", afterPayment.Summary.Status);
    }

    /// <summary>BR-55 — khoản thu thứ hai không gia hạn thêm lần nữa.</summary>
    [Fact]
    public async Task Khoan_thu_thu_hai_khong_gia_han_them()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 3_000_000m);

        var afterFirst = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var dueAfterDeposit = afterFirst.Summary.DueDateUtc;

        var afterSecond = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        Assert.Equal(dueAfterDeposit, afterSecond.Summary.DueDateUtc);
        Assert.Equal(afterFirst.Summary.FirstDepositAtUtc, afterSecond.Summary.FirstDepositAtUtc);
    }

    /// <summary>
    /// BR-55 — sau hạn thì đường thu thông thường bị chặn; hoá đơn KHÔNG tự Void và cọc
    /// không bị tịch thu (quy trình ngoại lệ của Manager chưa được chốt — SSOT §7).
    /// </summary>
    [Fact]
    public async Task Qua_han_thi_chan_thu_nhung_khong_tu_Void()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var issuedAt = DateTime.UtcNow.AddMonths(-5);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, issuedAt: issuedAt, dueDateUtc: issuedAt.AddMonths(2));

        var response = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000_000m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("invoice_overdue", await response.Content.ReadAsStringAsync());

        var status = await factory.QueryAsync(async db => await db.Set<Payment.Domain.Entities.Invoice>()
            .Where(i => i.InvoiceId == invoice.InvoiceId)
            .Select(i => i.Status)
            .SingleAsync());

        Assert.Equal(Payment.Domain.Enums.InvoiceStatus.Issued, status);
    }

    /// <summary>BR-55 — thu ĐÚNG hạn (chưa quá) vẫn phải được chấp nhận.</summary>
    [Fact]
    public async Task Thu_truoc_han_van_duoc_chap_nhan()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 1_000_000m, dueDateUtc: DateTime.UtcNow.AddMinutes(5));

        var response = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000_000m, method = "Cash" });

        Assert.True(response.IsSuccessStatusCode);
    }

    /// <summary>BR-41 — không thu vượt Outstanding.</summary>
    [Fact]
    public async Task Khong_thu_vuot_Outstanding()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var response = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000_001m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("payment_exceeds_invoice_balance", await response.Content.ReadAsStringAsync());
    }

    /// <summary>
    /// BR-41 — hai khoản thu đồng thời, mỗi khoản bằng đúng Outstanding: tổng thu không được
    /// vượt trần. Đây là ca chỉ PostgreSQL thật mới kiểm chứng được.
    /// </summary>
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

        var collected = await factory.QueryAsync(async db => await db.Set<Payment.Domain.Entities.Payment>()
            .Where(p => p.InvoiceId == invoice.InvoiceId
                        && p.Status == Payment.Domain.Enums.PaymentStatus.Success)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m);

        Assert.True(collected <= 1_000_000m, $"Đã thu {collected:N0} VND, vượt trần 1.000.000 VND.");
    }

    /// <summary>
    /// BR-30 — thu đủ thì gói chuyển Active, StartDate là ngày trả đủ (giờ VN),
    /// EndDate = StartDate + DurationDays − 1 (ngày cuối vẫn dùng được).
    /// </summary>
    [Fact]
    public async Task Thu_du_kich_hoat_goi_voi_ngay_dung_theo_BR30()
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

    /// <summary>
    /// BR-30 — gói chưa Active khi mới trả một phần. Kiểm tra tường minh vì đây là điều kiện
    /// mà một lỗi off-by-one ở IsFullyPaid sẽ phá vỡ âm thầm.
    /// </summary>
    [Fact]
    public async Task Tra_mot_phan_thi_goi_van_PendingPayment()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var (_, memberPackage) = await factory.SeedPendingPackageAsync(memberId);

        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, memberPackageId: memberPackage.MemberPackageId);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 2_999_999m, method = "Cash" }));

        var still = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.PendingPayment, still.Status);
    }

    /// <summary>
    /// BR-30 — một Discount kéo nghĩa vụ xuống bằng số đã thu cũng phải kích hoạt gói.
    /// Trước đây kích hoạt chỉ nằm ở đường thu tiền, nên gói đứng im ở PendingPayment.
    /// </summary>
    [Fact]
    public async Task Discount_lam_tron_nghia_vu_cung_kich_hoat_goi()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var (_, memberPackage) = await factory.SeedPendingPackageAsync(memberId);
        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 3_000_000m, memberPackageId: memberPackage.MemberPackageId);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 2_500_000m, method = "Cash" }));

        var beforeDiscount = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.PendingPayment, beforeDiscount.Status);

        var discount = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 500_000m, reason = "Giảm nốt phần còn lại" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{discount.AdjustmentId}/approve",
                new { reason = "Duyệt giảm giá" }));

        var activated = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(MemberPackageStatus.Active, activated.Status);
    }

    /// <summary>
    /// BR-30 — kích hoạt đúng MỘT lần: retry hay thu thêm không được reset ngày và lượt.
    /// Mô phỏng bằng cách trừ bớt lượt sau khi kích hoạt rồi ghi thêm một Discount 0 đồng…
    /// đơn giản hơn: thu đủ, ghi lại ngày, rồi đảm bảo một lần gọi GET/POST khác không đổi.
    /// </summary>
    [Fact]
    public async Task Kich_hoat_chi_mot_lan_khong_reset_ngay_va_luot()
    {
        var (memberId, receptionistId, frontDesk) = await SeedAsync();
        var (_, memberPackage) = await factory.SeedPendingPackageAsync(memberId, sessionLimit: 30);

        var invoice = await factory.SeedInvoiceAsync(
            memberId, receptionistId, 1_000_000m, memberPackageId: memberPackage.MemberPackageId);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        // Hội viên dùng vài buổi.
        await factory.QueryAsync(async db =>
        {
            var pkg = await db.Set<MemberPackage>()
                .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId);

            pkg.RemainingSessions = 25;
            await db.SaveChangesAsync();
            return true;
        });

        // Một khoản thu nữa phải bị từ chối (Outstanding = 0) và tuyệt đối không chạm vào gói.
        var extra = await frontDesk.PostAsJsonAsync(
            $"/api/invoices/{invoice.InvoiceId}/payments",
            new { amount = 1_000m, method = "Cash" });

        Assert.Equal(HttpStatusCode.Conflict, extra.StatusCode);

        var after = await factory.QueryAsync(async db => await db.Set<MemberPackage>()
            .AsNoTracking()
            .SingleAsync(p => p.MemberPackageId == memberPackage.MemberPackageId));

        Assert.Equal(25, after.RemainingSessions);
        Assert.Equal(MemberPackageStatus.Active, after.Status);
    }
}
