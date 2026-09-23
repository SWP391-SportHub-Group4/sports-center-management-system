using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

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
