using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.Commands.Refunds;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Api;

[ApiController]
[Authorize]
[Route("api/refunds")]
public sealed class PointRefundsController(IPointRefundService refunds) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? status, [FromQuery] Guid? invoiceId,
        [FromQuery] Guid? invoiceItemId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
        => Ok(await refunds.SearchAsync(status, invoiceId, invoiceItemId, page, pageSize, cancellationToken));

    [HttpGet("quote/{invoiceItemId:guid}")]
    public async Task<IActionResult> Quote(Guid invoiceItemId, CancellationToken ct)
    {
        var staff = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!staff && !User.IsInRole("Member") && !User.IsInRole("ExternalCoach")) return Forbid();
        return Ok(new { systemCalculatedPoints = await refunds.QuoteAsync(invoiceItemId, User.RequireUserId(), staff, ct) });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePointRefundRequest request,
        CancellationToken cancellationToken)
    {
        var canRequestForAnotherUser = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!canRequestForAnotherUser && !User.IsInRole("Member") && !User.IsInRole("ExternalCoach"))
            return Forbid();
        var result = await refunds.RequestAsync(request.InvoiceItemId, request.Reason, User.RequireUserId(),
            canRequestForAnotherUser, cancellationToken);
        return Ok(result);
    }

    [Authorize(Policy = SportHubPolicies.RefundApprove)]
    [HttpPost("{adjustmentId:guid}/approve")]
    public async Task<IActionResult> Approve(Guid adjustmentId, [FromBody] ApprovePointRefundRequest request,
        CancellationToken cancellationToken)
        => Ok(await refunds.ApproveAsync(adjustmentId, request, User.RequireUserId(), cancellationToken));

    [Authorize(Policy = SportHubPolicies.RefundApprove)]
    [HttpPost("{adjustmentId:guid}/reject")]
    public async Task<IActionResult> Reject(Guid adjustmentId, [FromBody] RejectAdjustmentRequest request,
        CancellationToken cancellationToken)
        => Ok(await refunds.RejectAsync(adjustmentId, request.Reason, User.RequireUserId(), cancellationToken));
}
