using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Api;

public sealed class RejectAdjustmentRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

[ApiController]
[Authorize]
[Route("api")]
public class InvoicesController(
    IInvoiceQueryService invoices,
    IPackagePurchaseService purchases,
    IPaymentRecordingService payments,
    IPaymentAdjustmentService adjustments) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("invoices")]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? memberId,
        [FromQuery] string? status,
        [FromQuery] bool overdueOnly = false,
        [FromQuery] string? keyword = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(memberId, status, overdueOnly, keyword, page, pageSize, ct));

    /// <summary>Self action — hội viên xem hóa đơn của chính mình, memberId lấy từ JWT.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/invoices")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(User.RequireUserId(), null, false, null, page, pageSize, ct));

    [HttpGet("invoices/{invoiceId:guid}")]
    public async Task<IActionResult> GetDetail(Guid invoiceId, CancellationToken ct)
    {
        var detail = await invoices.GetDetailAsync(invoiceId, ct);

        // Hội viên chỉ đọc hoá đơn của mình. Kiểm ở đây chứ không chỉ ẩn trên UI: id là Guid
        // nhưng vẫn có thể lọt ra ngoài qua link hoặc log.
        if (User.IsInRole(SportHubRoleNames.Member) && detail.Summary.MemberId != User.RequireUserId())
        {
            throw new ForbiddenException("invoice_not_owned", "Hóa đơn này không thuộc về bạn.");
        }

        return Ok(detail);
    }

    /// <summary>BR-30 — chọn gói là phát hành hóa đơn ngay, trước khi thu tiền.</summary>
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("member-packages/purchase")]
    public async Task<IActionResult> Purchase([FromBody] PurchasePackageRequest request, CancellationToken ct)
    {
        var result = await purchases.PurchaseAsync(
            request,
            User.RequireUserId(),
            User.IsInRole(SportHubRoleNames.CenterManager),
            ct);

        return StatusCode(StatusCodes.Status201Created, result);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("invoices/{invoiceId:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid invoiceId,
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
        => Ok(await payments.RecordAsync(invoiceId, request, User.RequireUserId(), ct));

    /// <summary>BR-42 — Lễ tân (và Manager) tạo yêu cầu; việc duyệt là của Manager.</summary>
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("invoices/{invoiceId:guid}/adjustments")]
    public async Task<IActionResult> RequestAdjustment(
        Guid invoiceId,
        [FromBody] CreateAdjustmentRequest request,
        CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created,
            await adjustments.RequestAsync(invoiceId, request, User.RequireUserId(), ct));
}

[ApiController]
[Authorize]
[Route("api/payment-adjustments")]
public class PaymentAdjustmentsController(IPaymentAdjustmentService adjustments) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] Guid? invoiceId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await adjustments.SearchAsync(status, invoiceId, page, pageSize, ct));

    /// <summary>BR-42 — chỉ Center Manager duyệt, và không được duyệt yêu cầu của chính mình.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{adjustmentId:guid}/approve")]
    public async Task<IActionResult> Approve(
        Guid adjustmentId,
        [FromBody] ApproveAdjustmentRequest request,
        CancellationToken ct)
        => Ok(await adjustments.ApproveAsync(adjustmentId, request, User.RequireUserId(), ct));

    /// <summary>
    /// BR-42 v1.4 — Lễ tân xác nhận đã THỰC TRẢ. Cố ý là policy FrontDesk chứ không phải
    /// CenterManager: người duyệt và người chi tiền phải tách nhau, gộp lại thì Manager tự
    /// duyệt rồi tự xác nhận đã trả mà không ai đối chứng.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("{adjustmentId:guid}/complete")]
    public async Task<IActionResult> Complete(
        Guid adjustmentId,
        [FromBody] CompleteAdjustmentRequest request,
        CancellationToken ct)
        => Ok(await adjustments.CompleteRefundAsync(adjustmentId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{adjustmentId:guid}/reject")]
    public async Task<IActionResult> Reject(
        Guid adjustmentId,
        [FromBody] RejectAdjustmentRequest request,
        CancellationToken ct)
        => Ok(await adjustments.RejectAsync(adjustmentId, request.Reason, User.RequireUserId(), ct));
}

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports")]
public class RevenueReportsController(IRevenueReportService revenue) : ControllerBase
{
    /// <summary>BR-32/BR-43 — chỉ Center Manager; số liệu đã trừ điều chỉnh hoàn thành trong kỳ.</summary>
    [HttpGet("revenue")]
    public async Task<IActionResult> GetRevenue(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken ct = default)
    {
        var to = toDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var from = fromDate ?? to.AddDays(-29);

        // Chặn khoảng quá dài: báo cáo trả về từng ngày nên 5 năm sẽ là gần 2000 dòng JSON.
        if (to.DayNumber - from.DayNumber > 366)
        {
            throw new BadRequestException("range_too_large", "Khoảng báo cáo tối đa 366 ngày.");
        }

        return Ok(await revenue.GetAsync(from, to, ct));
    }
}
