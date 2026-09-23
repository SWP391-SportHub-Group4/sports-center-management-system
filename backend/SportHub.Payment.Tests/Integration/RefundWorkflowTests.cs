using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using System.Net;
using System.Net.Http.Json;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// BR-41/42/43 v1.4 — vòng đời điều chỉnh đi qua API thật trên PostgreSQL thật.
///
/// Trọng tâm: Approved KHÔNG phải đã trả. Bản v1.3 gộp hai bước nên mọi con số tiền thay đổi
/// ngay lúc Manager bấm duyệt; các test dưới đây khoá lại hành vi đúng.
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public class RefundWorkflowTests(PaymentApiFactory factory)
{
    private async Task<(Guid MemberId, Guid ReceptionistId, Guid ManagerId)> SeedActorsAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);

        return (member.UserId, receptionist.UserId, manager.UserId);
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>
    /// Kịch bản nghiệm thu §9.4 đầy đủ: thu đủ → Discount → RefundDue xuất hiện nhưng chưa
    /// hoàn đồng nào → duyệt Refund (tiền KHÔNG đổi) → Lễ tân xác nhận trả (tiền mới đổi).
    /// </summary>
    [Fact]
    public async Task Discount_roi_Refund_chi_tinh_tien_khi_le_tan_xac_nhan_thuc_tra()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 3_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        // 1. Thu đủ 3 triệu.
        var afterPayment = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 3_000_000m, method = "Cash" }));

        Assert.Equal(3_000_000m, afterPayment.Summary.GrossCollected);
        Assert.Equal(0m, afterPayment.Summary.Outstanding);
        Assert.Equal(0m, afterPayment.Summary.RefundDue);
        Assert.Equal("Paid", afterPayment.Summary.Status);

        // 2. Discount 500k: giảm NGHĨA VỤ ⇒ sinh ra khoản CẦN hoàn, chưa hoàn đồng nào.
        var discount = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 500_000m, reason = "Khuyến mãi bù cho buổi bị hủy" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{discount.AdjustmentId}/approve",
                new { reason = "Đồng ý giảm theo chính sách" }));

        var afterDiscount = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(2_500_000m, afterDiscount.Summary.NetPayable);
        Assert.Equal(3_000_000m, afterDiscount.Summary.NetCollected);
        Assert.Equal(500_000m, afterDiscount.Summary.RefundDue);
        Assert.Equal(0m, afterDiscount.Summary.RefundedAmount);

        // BR-40 — Paid là dữ kiện lịch sử, điều chỉnh không kéo ngược trạng thái.
        Assert.Equal("Paid", afterDiscount.Summary.Status);

        // 3. Refund 500k được DUYỆT — tiền vẫn chưa đổi.
        var refund = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Refund", amount = 500_000m, reason = "Hoàn phần đã giảm cho hội viên" }));

        var approved = await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{refund.AdjustmentId}/approve",
                new { reason = "Duyệt hoàn tiền" }));

        Assert.Equal("Approved", approved.Status);
        Assert.True(approved.AwaitingPayout);
        Assert.NotNull(approved.ApprovedAtUtc);
        Assert.Null(approved.CompletedAtUtc);

        var afterApprove = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(0m, afterApprove.Summary.RefundedAmount);
        Assert.Equal(500_000m, afterApprove.Summary.RefundDue);
        Assert.Equal(3_000_000m, afterApprove.Summary.NetCollected);

        // 4. Lễ tân xác nhận đã thực trả — bây giờ tiền mới đổi.
        var completed = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/payment-adjustments/{refund.AdjustmentId}/complete",
                new { refundMethod = "Cash", note = "Trả tiền mặt tại quầy" }));

        Assert.Equal("Completed", completed.Status);
        Assert.False(completed.AwaitingPayout);
        Assert.NotNull(completed.CompletedAtUtc);
        Assert.Equal(receptionistId, completed.CompletedByUserId);
        Assert.Equal("Cash", completed.RefundMethod);

        var final = await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"));

        Assert.Equal(500_000m, final.Summary.RefundedAmount);
        Assert.Equal(0m, final.Summary.RefundDue);
        Assert.Equal(2_500_000m, final.Summary.NetCollected);
        Assert.Equal(2_500_000m, final.Summary.NetPayable);
        Assert.Equal(0m, final.Summary.Outstanding);
        Assert.Equal("Paid", final.Summary.Status);
    }

    /// <summary>
    /// Kịch bản thứ hai của plan §4.3: thu cọc 1 triệu / hóa đơn 3 triệu, Discount 500 nghìn
    /// ⇒ Outstanding 1,5 triệu và KHÔNG phát sinh tiền hoàn giả.
    /// </summary>
    [Fact]
    public async Task Coc_mot_phan_cong_Discount_khong_sinh_tien_hoan_gia()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 3_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var discount = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 500_000m, reason = "Giảm giá theo chương trình" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{discount.AdjustmentId}/approve",
                new { reason = "Duyệt giảm giá" }));

        var summary = (await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.GetAsync($"/api/invoices/{invoice.InvoiceId}"))).Summary;

        Assert.Equal(2_500_000m, summary.NetPayable);
        Assert.Equal(1_000_000m, summary.NetCollected);
        Assert.Equal(1_500_000m, summary.Outstanding);
        Assert.Equal(0m, summary.RefundDue);
        Assert.Equal(0m, summary.RefundedAmount);
        Assert.Equal("PartiallyPaid", summary.Status);
    }

    /// <summary>BR-42 — retry bước complete không được hoàn tiền hai lần.</summary>
    [Fact]
    public async Task Complete_lan_hai_bi_tu_choi_va_khong_hoan_hai_lan()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var refundId = await SeedApprovedRefundAsync(memberId, receptionistId, managerId, 500_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        var first = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundId}/complete",
            new { refundMethod = "Cash", note = "Trả lần một" });

        Assert.True(first.IsSuccessStatusCode);

        var second = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundId}/complete",
            new { refundMethod = "Cash", note = "Bấm lại do mạng lag" });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var refunded = await factory.QueryAsync(async db => await db.Set<PaymentAdjustment>()
            .Where(a => a.AdjustmentId == refundId)
            .Select(a => a.Amount)
            .SingleAsync());

        Assert.Equal(500_000m, refunded);

        var completedCount = await factory.QueryAsync(async db => await db.Set<PaymentAdjustment>()
            .CountAsync(a => a.AdjustmentId == refundId && a.Status == PaymentAdjustmentStatus.Completed));

        Assert.Equal(1, completedCount);
    }

    /// <summary>
    /// BR-42 — hai request complete chạy ĐỒNG THỜI trên cùng một adjustment: đúng một cái
    /// thắng. Đây là lý do bước complete phải khoá hàng bằng SELECT ... FOR UPDATE.
    /// </summary>
    [Fact]
    public async Task Hai_request_complete_dong_thoi_chi_mot_cai_thanh_cong()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var refundId = await SeedApprovedRefundAsync(memberId, receptionistId, managerId, 500_000m);

        var clientA = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var clientB = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        var bodyA = new { refundMethod = "Cash", note = "Quầy A trả tiền" };
        var bodyB = new { refundMethod = "Cash", note = "Quầy B trả tiền" };

        var responses = await Task.WhenAll(
            clientA.PostAsJsonAsync($"/api/payment-adjustments/{refundId}/complete", bodyA),
            clientB.PostAsJsonAsync($"/api/payment-adjustments/{refundId}/complete", bodyB));

        Assert.Equal(1, responses.Count(r => r.IsSuccessStatusCode));

        var refundedTotal = await factory.QueryAsync(async db => await db.Set<PaymentAdjustment>()
            .Where(a => a.AdjustmentId == refundId && a.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(a => (decimal?)a.Amount) ?? 0m);

        Assert.Equal(500_000m, refundedTotal);
    }

    /// <summary>
    /// BR-41/52 — tổng các khoản hoàn trên cùng một hóa đơn không được vượt số thực thu,
    /// kể cả khi chúng là hai adjustment khác nhau cùng được duyệt trước đó.
    /// </summary>
    [Fact]
    public async Task Hai_refund_khac_nhau_khong_duoc_vuot_tong_so_thuc_thu()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        // Correction xoá toàn bộ nghĩa vụ ⇒ RefundDue = 1 triệu.
        var correction = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Correction", amount = 1_000_000m, reason = "Ghi sai dịch vụ, huỷ toàn bộ" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{correction.AdjustmentId}/approve",
                new { reason = "Xác nhận ghi sai" }));

        // Hai yêu cầu hoàn, mỗi cái 700k — từng cái riêng lẻ đều hợp lệ, cộng lại thì vượt.
        var refundIds = new List<Guid>();

        foreach (var note in new[] { "Hoàn đợt 1", "Hoàn đợt 2" })
        {
            var created = await ReadAsync<PaymentAdjustmentResponse>(
                await frontDesk.PostAsJsonAsync(
                    $"/api/invoices/{invoice.InvoiceId}/adjustments",
                    new { type = "Refund", amount = 700_000m, reason = note }));

            await ReadAsync<PaymentAdjustmentResponse>(
                await managerClient.PostAsJsonAsync(
                    $"/api/payment-adjustments/{created.AdjustmentId}/approve",
                    new { reason = "Duyệt " + note }));

            refundIds.Add(created.AdjustmentId);
        }

        var first = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundIds[0]}/complete",
            new { refundMethod = "Cash", note = "Trả đợt 1" });

        var second = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundIds[1]}/complete",
            new { refundMethod = "Cash", note = "Trả đợt 2" });

        Assert.True(first.IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var totalRefunded = await factory.QueryAsync(async db => await db.Set<PaymentAdjustment>()
            .Where(a => a.InvoiceId == invoice.InvoiceId
                        && a.Type == PaymentAdjustmentType.Refund
                        && a.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(a => (decimal?)a.Amount) ?? 0m);

        Assert.Equal(700_000m, totalRefunded);
        Assert.True(totalRefunded <= 1_000_000m, "Tổng hoàn vượt số thực thu.");
    }

    /// <summary>
    /// BR-41/42 — hai adjustment KHÁC NHAU của cùng hoá đơn, complete ĐỒNG THỜI.
    ///
    /// Khoá theo hàng adjustment không cứu được ca này (hai hàng khác nhau), nên nó chỉ đúng
    /// khi bước complete khoá thêm hàng HOÁ ĐƠN. Đây là biến thể đồng thời của
    /// <see cref="Hai_refund_khac_nhau_khong_duoc_vuot_tong_so_thuc_thu"/>.
    /// </summary>
    [Fact]
    public async Task Hai_refund_khac_nhau_complete_dong_thoi_khong_vuot_tran()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var correction = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Correction", amount = 1_000_000m, reason = "Huỷ toàn bộ dịch vụ" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{correction.AdjustmentId}/approve",
                new { reason = "Duyệt correction" }));

        var refundIds = new List<Guid>();

        foreach (var note in new[] { "Hoàn đợt 1", "Hoàn đợt 2" })
        {
            var created = await ReadAsync<PaymentAdjustmentResponse>(
                await frontDesk.PostAsJsonAsync(
                    $"/api/invoices/{invoice.InvoiceId}/adjustments",
                    new { type = "Refund", amount = 700_000m, reason = note }));

            await ReadAsync<PaymentAdjustmentResponse>(
                await managerClient.PostAsJsonAsync(
                    $"/api/payment-adjustments/{created.AdjustmentId}/approve",
                    new { reason = "Duyệt " + note }));

            refundIds.Add(created.AdjustmentId);
        }

        var clientA = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var clientB = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        await Task.WhenAll(
            clientA.PostAsJsonAsync(
                $"/api/payment-adjustments/{refundIds[0]}/complete",
                new { refundMethod = "Cash", note = "Quầy A trả đợt 1" }),
            clientB.PostAsJsonAsync(
                $"/api/payment-adjustments/{refundIds[1]}/complete",
                new { refundMethod = "Cash", note = "Quầy B trả đợt 2" }));

        var totalRefunded = await factory.QueryAsync(async db => await db.Set<PaymentAdjustment>()
            .Where(a => a.InvoiceId == invoice.InvoiceId
                        && a.Type == PaymentAdjustmentType.Refund
                        && a.Status == PaymentAdjustmentStatus.Completed)
            .SumAsync(a => (decimal?)a.Amount) ?? 0m);

        Assert.True(
            totalRefunded <= 1_000_000m,
            $"Đã hoàn {totalRefunded:N0} VND, vượt số thực thu 1.000.000 VND.");
    }

    /// <summary>
    /// BR-52 — không hoàn được khi chưa có căn cứ giảm nghĩa vụ: hội viên trả đủ và vẫn nợ
    /// đủ nghĩa vụ thì không có gì để trả lại.
    /// </summary>
    [Fact]
    public async Task Khong_complete_duoc_refund_khi_chua_co_can_cu_giam_nghia_vu()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount = 1_000_000m, method = "Cash" }));

        var refund = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Refund", amount = 400_000m, reason = "Hội viên xin hoàn một phần" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{refund.AdjustmentId}/approve",
                new { reason = "Duyệt hoàn" }));

        var complete = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refund.AdjustmentId}/complete",
            new { refundMethod = "Cash", note = "Trả tiền" });

        Assert.Equal(HttpStatusCode.Conflict, complete.StatusCode);
        Assert.Contains("refund_exceeds_refund_due", await complete.Content.ReadAsStringAsync());
    }

    /// <summary>BR-42 — chuyển khoản phải có mã tham chiếu; tiền mặt thì không bắt buộc.</summary>
    [Fact]
    public async Task Hoan_bang_chuyen_khoan_bat_buoc_ma_tham_chieu()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var refundId = await SeedApprovedRefundAsync(memberId, receptionistId, managerId, 500_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        var withoutReference = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundId}/complete",
            new { refundMethod = "Transfer", note = "Chuyển khoản cho hội viên" });

        Assert.Equal(HttpStatusCode.BadRequest, withoutReference.StatusCode);
        Assert.Contains("refund_reference_required", await withoutReference.Content.ReadAsStringAsync());

        var withReference = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundId}/complete",
            new { refundMethod = "Transfer", refundReferenceCode = "FT26092200123", note = "Chuyển khoản" });

        var completed = await ReadAsync<PaymentAdjustmentResponse>(withReference);

        Assert.Equal("Transfer", completed.RefundMethod);
        Assert.Equal("FT26092200123", completed.RefundReferenceCode);
    }

    /// <summary>BR-42 — Manager không được tự duyệt yêu cầu do chính mình tạo.</summary>
    [Fact]
    public async Task Manager_khong_duoc_tu_duyet_yeu_cau_cua_chinh_minh()
    {
        var (memberId, receptionistId, _) = await SeedActorsAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var created = await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 100_000m, reason = "Manager tự tạo yêu cầu" }));

        var approve = await managerClient.PostAsJsonAsync(
            $"/api/payment-adjustments/{created.AdjustmentId}/approve",
            new { reason = "Tự duyệt" });

        Assert.Equal(HttpStatusCode.Forbidden, approve.StatusCode);
    }

    /// <summary>BR-42 — chỉ Center Manager duyệt; Lễ tân gọi endpoint approve phải bị chặn.</summary>
    [Fact]
    public async Task Le_tan_khong_duoc_duyet_dieu_chinh()
    {
        var (memberId, receptionistId, _) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        var created = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 100_000m, reason = "Yêu cầu giảm giá" }));

        var approve = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{created.AdjustmentId}/approve",
            new { reason = "Lễ tân tự duyệt" });

        Assert.Equal(HttpStatusCode.Forbidden, approve.StatusCode);
    }

    /// <summary>Member không được gọi bất kỳ endpoint điều chỉnh nào.</summary>
    [Fact]
    public async Task Member_khong_truy_cap_duoc_endpoint_dieu_chinh()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var refundId = await SeedApprovedRefundAsync(memberId, receptionistId, managerId, 500_000m);

        var memberClient = factory.CreateApiClient(memberId, UserRole.Member);

        var complete = await memberClient.PostAsJsonAsync(
            $"/api/payment-adjustments/{refundId}/complete",
            new { refundMethod = "Cash", note = "Tự xác nhận đã nhận tiền" });

        Assert.Equal(HttpStatusCode.Forbidden, complete.StatusCode);
    }

    /// <summary>Complete chỉ dành cho Refund; Discount đã Completed ngay lúc duyệt.</summary>
    [Fact]
    public async Task Khong_complete_duoc_mot_Discount()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        var discount = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Discount", amount = 200_000m, reason = "Giảm giá" }));

        var approved = await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{discount.AdjustmentId}/approve",
                new { reason = "Duyệt" }));

        Assert.Equal("Completed", approved.Status);
        Assert.NotNull(approved.CompletedAtUtc);
        Assert.False(approved.AwaitingPayout);

        var complete = await frontDesk.PostAsJsonAsync(
            $"/api/payment-adjustments/{discount.AdjustmentId}/complete",
            new { refundMethod = "Cash", note = "Thử complete" });

        Assert.Equal(HttpStatusCode.Conflict, complete.StatusCode);
        Assert.Contains("not_a_refund", await complete.Content.ReadAsStringAsync());
    }

    /// <summary>BR-40 — hoá đơn không bao giờ bị xoá, kể cả sau khi hoàn toàn bộ tiền.</summary>
    [Fact]
    public async Task Hoa_don_khong_bi_xoa_sau_khi_hoan_toan_bo()
    {
        var (memberId, receptionistId, managerId) = await SeedActorsAsync();
        var refundId = await SeedApprovedRefundAsync(memberId, receptionistId, managerId, 1_000_000m);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);

        var completed = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/payment-adjustments/{refundId}/complete",
                new { refundMethod = "Cash", note = "Hoàn toàn bộ" }));

        var stillThere = await factory.QueryAsync(async db => await db.Set<Invoice>()
            .AnyAsync(i => i.InvoiceId == completed.InvoiceId));

        Assert.True(stillThere);

        var status = await factory.QueryAsync(async db => await db.Set<Invoice>()
            .Where(i => i.InvoiceId == completed.InvoiceId)
            .Select(i => i.Status)
            .SingleAsync());

        Assert.Equal(InvoiceStatus.Paid, status);
    }

    /// <summary>
    /// Dựng sẵn một Refund đã duyệt trên hoá đơn đã thu đủ và đã có Correction xoá nghĩa vụ,
    /// để các test chỉ tập trung vào bước complete.
    /// </summary>
    private async Task<Guid> SeedApprovedRefundAsync(
        Guid memberId, Guid receptionistId, Guid managerId, decimal amount)
    {
        var invoice = await factory.SeedInvoiceAsync(memberId, receptionistId, amount);

        var frontDesk = factory.CreateApiClient(receptionistId, UserRole.Receptionist);
        var managerClient = factory.CreateApiClient(managerId, UserRole.CenterManager);

        await ReadAsync<InvoiceDetailResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/payments",
                new { amount, method = "Cash" }));

        var correction = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Correction", amount, reason = "Huỷ dịch vụ, xoá nghĩa vụ" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{correction.AdjustmentId}/approve",
                new { reason = "Duyệt correction" }));

        var refund = await ReadAsync<PaymentAdjustmentResponse>(
            await frontDesk.PostAsJsonAsync(
                $"/api/invoices/{invoice.InvoiceId}/adjustments",
                new { type = "Refund", amount, reason = "Hoàn tiền cho hội viên" }));

        await ReadAsync<PaymentAdjustmentResponse>(
            await managerClient.PostAsJsonAsync(
                $"/api/payment-adjustments/{refund.AdjustmentId}/approve",
                new { reason = "Duyệt hoàn tiền" }));

        return refund.AdjustmentId;
    }
}
