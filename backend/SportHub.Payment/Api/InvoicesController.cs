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
        [FromQuery] string? keyword = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(memberId, status, keyword, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/invoices")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(User.RequireUserId(), null, null, page, pageSize, ct));

    [HttpGet("invoices/{invoiceId:guid}")]
    public async Task<IActionResult> GetDetail(Guid invoiceId, CancellationToken ct)
    {
        var detail = await invoices.GetDetailAsync(invoiceId, ct);

        if (User.IsInRole(SportHubRoleNames.Member) && detail.Summary.MemberId != User.RequireUserId())
        {
            throw new ForbiddenException("invoice_not_owned", "Hóa đơn này không thuộc về bạn.");
        }

        return Ok(detail);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("member-packages/purchase")]
    public async Task<IActionResult> Purchase([FromBody] PurchasePackageRequest request, CancellationToken ct)
    {
        var result = await purchases.PurchaseAsync(
            request,
            User.RequireUserId(),
            User.IsInRole(SportHubRoleNames.CenterManager),
            ct,
            Guid.NewGuid().ToString("N"));

        return StatusCode(StatusCodes.Status201Created, result);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("invoices/{invoiceId:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid invoiceId,
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
        => Ok(await payments.RecordAsync(invoiceId, request, User.RequireUserId(), ct));

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
