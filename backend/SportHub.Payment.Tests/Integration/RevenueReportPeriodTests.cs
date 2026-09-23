using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using System.Net;
using System.Net.Http.Json;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// BR-43 v1.4 — thu ròng quy kỳ theo NGÀY THỰC TRẢ, và Discount/Correction không trừ vào
/// chỉ tiêu thu ròng.
///
/// Các test này ghi thẳng mốc thời gian vào DB thay vì đi qua API: cần đặt được ngày duyệt
/// và ngày trả vào hai kỳ khác nhau, mà API luôn dùng thời điểm hiện tại.
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public class RevenueReportPeriodTests(PaymentApiFactory factory)
{
    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>
    /// Duyệt hoàn ở kỳ trước, thực trả ở kỳ này ⇒ thu ròng giảm ở KỲ NÀY, không phải kỳ duyệt.
    /// Bản v1.3 quy kỳ theo ResolvedAt (= ngày duyệt) nên trừ nhầm kỳ.
    /// </summary>
    [Fact]
    public async Task Refund_quy_ky_theo_ngay_thuc_tra_khong_phai_ngay_duyet()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);

        // Ngày cố định, xa hiện tại để không đụng dữ liệu của test khác.
        var approveDay = new DateOnly(2026, 4, 10);
        var payoutDay = new DateOnly(2026, 5, 12);
        var paymentDay = new DateOnly(2026, 4, 5);

        var invoice = await factory.SeedInvoiceAsync(
            member.UserId, receptionist.UserId, 2_000_000m,
            issuedAt: VietnamTime.StartOfDayUtc(paymentDay).AddHours(2));

        await factory.QueryAsync(async db =>
        {
            db.Set<Payment.Domain.Entities.Payment>().Add(new Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Amount = 2_000_000m,
                Method = PaymentMethod.Cash,
                Status = PaymentStatus.Success,
                ReceivedByUserId = receptionist.UserId,
                PaidAt = VietnamTime.StartOfDayUtc(paymentDay).AddHours(10)
            });

            db.Set<PaymentAdjustment>().Add(new PaymentAdjustment
            {
                AdjustmentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Type = PaymentAdjustmentType.Refund,
                Amount = 500_000m,
                RequestedAmount = 500_000m,
                Reason = "Hoàn một phần",
                Status = PaymentAdjustmentStatus.Completed,
                RequestedByUserId = receptionist.UserId,
                ApprovedByUserId = manager.UserId,
                CreatedAt = VietnamTime.StartOfDayUtc(approveDay).AddHours(8),

                // Duyệt tháng 4...
                ApprovedAtUtc = VietnamTime.StartOfDayUtc(approveDay).AddHours(9),

                // ...nhưng tiền ra khỏi quầy tháng 5.
                CompletedAtUtc = VietnamTime.StartOfDayUtc(payoutDay).AddHours(9),
                CompletedByUserId = receptionist.UserId,
                RefundMethod = PaymentMethod.Cash,
                ResolvedAt = VietnamTime.StartOfDayUtc(payoutDay).AddHours(9)
            });

            await db.SaveChangesAsync();
            return true;
        });

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var april = await ReadAsync<RevenueReportResponse>(
            await managerClient.GetAsync("/api/reports/revenue?fromDate=2026-04-01&toDate=2026-04-30"));

        var may = await ReadAsync<RevenueReportResponse>(
            await managerClient.GetAsync("/api/reports/revenue?fromDate=2026-05-01&toDate=2026-05-31"));

        // Tháng 4: thu 2 triệu, KHÔNG có khoản hoàn nào dù đã duyệt trong tháng.
        Assert.Equal(2_000_000m, april.TotalCollected);
        Assert.Equal(0m, april.TotalRefunded);
        Assert.Equal(2_000_000m, april.NetRevenue);

        // Tháng 5: không thu gì, nhưng thu ròng âm 500k vì đã chi tiền ra.
        Assert.Equal(0m, may.TotalCollected);
        Assert.Equal(500_000m, may.TotalRefunded);
        Assert.Equal(-500_000m, may.NetRevenue);
        Assert.Equal(1, may.RefundCount);
    }

    /// <summary>
    /// BR-43 — Discount hiển thị RIÊNG và KHÔNG trừ vào thu ròng. Nếu trừ, thì khi cùng khoản
    /// đó sau này được hoàn bằng tiền, doanh thu bị trừ hai lần.
    /// </summary>
    [Fact]
    public async Task Discount_khong_tru_vao_thu_rong_ma_hien_thi_rieng()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);

        var day = new DateOnly(2026, 7, 15);

        var invoice = await factory.SeedInvoiceAsync(
            member.UserId, receptionist.UserId, 2_000_000m,
            issuedAt: VietnamTime.StartOfDayUtc(day).AddHours(1));

        await factory.QueryAsync(async db =>
        {
            db.Set<Payment.Domain.Entities.Payment>().Add(new Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Amount = 1_500_000m,
                Method = PaymentMethod.Cash,
                Status = PaymentStatus.Success,
                ReceivedByUserId = receptionist.UserId,
                PaidAt = VietnamTime.StartOfDayUtc(day).AddHours(10)
            });

            db.Set<PaymentAdjustment>().Add(new PaymentAdjustment
            {
                AdjustmentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Type = PaymentAdjustmentType.Discount,
                Amount = 500_000m,
                RequestedAmount = 500_000m,
                Reason = "Giảm giá khuyến mãi",
                Status = PaymentAdjustmentStatus.Completed,
                RequestedByUserId = receptionist.UserId,
                ApprovedByUserId = manager.UserId,
                CreatedAt = VietnamTime.StartOfDayUtc(day).AddHours(11),
                ApprovedAtUtc = VietnamTime.StartOfDayUtc(day).AddHours(11),
                CompletedAtUtc = VietnamTime.StartOfDayUtc(day).AddHours(11),
                ResolvedAt = VietnamTime.StartOfDayUtc(day).AddHours(11)
            });

            await db.SaveChangesAsync();
            return true;
        });

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var report = await ReadAsync<RevenueReportResponse>(
            await managerClient.GetAsync("/api/reports/revenue?fromDate=2026-07-15&toDate=2026-07-15"));

        Assert.Equal(1_500_000m, report.TotalCollected);
        Assert.Equal(0m, report.TotalRefunded);
        Assert.Equal(500_000m, report.TotalObligationReduction);

        // Thu ròng = tiền thật vào, KHÔNG trừ khoản giảm nghĩa vụ.
        Assert.Equal(1_500_000m, report.NetRevenue);
    }

    /// <summary>
    /// Dữ liệu legacy (Refund Completed không có bằng chứng thực trả) bị loại khỏi chỉ tiêu
    /// tiền theo kỳ, thay vì bị gán bừa ngày duyệt — xem docs/legacy-refund-reconciliation.md.
    /// </summary>
    [Fact]
    public async Task Refund_legacy_khong_co_ngay_thuc_tra_khong_vao_bao_cao_ky()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);

        var day = new DateOnly(2026, 8, 20);

        var invoice = await factory.SeedInvoiceAsync(
            member.UserId, receptionist.UserId, 1_000_000m,
            issuedAt: VietnamTime.StartOfDayUtc(day).AddHours(1));

        await factory.QueryAsync(async db =>
        {
            db.Set<Payment.Domain.Entities.Payment>().Add(new Payment.Domain.Entities.Payment
            {
                PaymentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Amount = 1_000_000m,
                Method = PaymentMethod.Cash,
                Status = PaymentStatus.Success,
                ReceivedByUserId = receptionist.UserId,
                PaidAt = VietnamTime.StartOfDayUtc(day).AddHours(10)
            });

            db.Set<PaymentAdjustment>().Add(new PaymentAdjustment
            {
                AdjustmentId = Guid.NewGuid(),
                InvoiceId = invoice.InvoiceId,
                Type = PaymentAdjustmentType.Refund,
                Amount = 300_000m,
                RequestedAmount = 300_000m,
                Reason = "Bản ghi cũ trước khi tách approve/complete",
                Status = PaymentAdjustmentStatus.Completed,
                RequestedByUserId = receptionist.UserId,
                ApprovedByUserId = manager.UserId,
                CreatedAt = VietnamTime.StartOfDayUtc(day).AddHours(11),
                ResolvedAt = VietnamTime.StartOfDayUtc(day).AddHours(11),

                // Không có CompletedAtUtc / CompletedByUserId / RefundMethod.
                LegacyPayoutUnverified = true
            });

            await db.SaveChangesAsync();
            return true;
        });

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var report = await ReadAsync<RevenueReportResponse>(
            await managerClient.GetAsync("/api/reports/revenue?fromDate=2026-08-20&toDate=2026-08-20"));

        Assert.Equal(1_000_000m, report.TotalCollected);
        Assert.Equal(0m, report.TotalRefunded);
        Assert.Equal(0, report.RefundCount);

        // Nhưng số dư hoá đơn VẪN tính khoản này, để không ai hoàn lần thứ hai.
        var frontDesk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        var detail = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(300_000m, detail.Summary.RefundedAmount);
        Assert.Equal(700_000m, detail.Summary.NetCollected);
    }

    /// <summary>BR-32/BR-43 — chỉ Center Manager xem được báo cáo doanh thu.</summary>
    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Chi_Center_Manager_xem_duoc_bao_cao_doanh_thu(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(user.UserId, role);

        var response = await client.GetAsync("/api/reports/revenue?fromDate=2026-01-01&toDate=2026-01-31");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    /// <summary>
    /// CHECK constraint ở tầng DB: một Refund Completed mới KHÔNG được tồn tại nếu thiếu
    /// bằng chứng thực trả. Chặn cả đường ghi trực tiếp chứ không chỉ đường service.
    /// </summary>
    [Fact]
    public async Task DB_chan_Refund_Completed_thieu_bang_chung_thuc_tra()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, receptionist.UserId, 1_000_000m);

        var ex = await Assert.ThrowsAnyAsync<DbUpdateException>(async () =>
            await factory.QueryAsync(async db =>
            {
                db.Set<PaymentAdjustment>().Add(new PaymentAdjustment
                {
                    AdjustmentId = Guid.NewGuid(),
                    InvoiceId = invoice.InvoiceId,
                    Type = PaymentAdjustmentType.Refund,
                    Amount = 100_000m,
                    RequestedAmount = 100_000m,
                    Reason = "Ghi thẳng vào DB, không qua service",
                    Status = PaymentAdjustmentStatus.Completed,
                    RequestedByUserId = receptionist.UserId,
                    ApprovedByUserId = manager.UserId,
                    CreatedAt = DateTime.UtcNow

                    // Thiếu CompletedAtUtc / CompletedByUserId / RefundMethod và không phải legacy.
                });

                await db.SaveChangesAsync();
                return true;
            }));

        Assert.Contains("CK_payment_adjustments", ex.InnerException?.Message ?? ex.Message);
    }
}
