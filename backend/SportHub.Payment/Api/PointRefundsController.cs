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
public sealed class PointRefundsController(IPointRefundService refunds,
    SportHub.Payment.Application.Services.ICenterCancellationRefundService centerCancellations) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? status, [FromQuery] Guid? invoiceId,
        [FromQuery] Guid? invoiceItemId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
        => Ok(await refunds.SearchAsync(status, invoiceId, invoiceItemId, page, pageSize, cancellationToken));

    [Authorize(Roles = "Member")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine([FromQuery] string? status, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
        => Ok(await refunds.SearchMineAsync(User.RequireUserId(), status, page, pageSize, cancellationToken));

    /// <summary>Quyền lợi bị trung tâm hủy của Member và lựa chọn hoàn (nhận điểm ngay hoặc gửi yêu cầu cho Manager).</summary>
    [Authorize(Roles = "Member")]
    [HttpGet("center-cancellations/mine")]
    public async Task<IActionResult> CenterCancellations(CancellationToken cancellationToken)
        => Ok(await centerCancellations.ListMineAsync(User.RequireUserId(), cancellationToken));

    /// <summary>Member chọn nhận 100% giá trị còn lại bằng điểm: hoàn tự động, idempotent, loại trừ yêu cầu hoàn tiền.</summary>
    [Authorize(Roles = "Member")]
    [HttpPost("center-cancellations/{invoiceItemId:guid}/points")]
    public async Task<IActionResult> ChooseCenterCancellationPoints(Guid invoiceItemId, CancellationToken cancellationToken)
        => Ok(await centerCancellations.ChoosePointsAsync(User.RequireUserId(), invoiceItemId, cancellationToken));

    [HttpGet("quote/{invoiceItemId:guid}")]
    public async Task<IActionResult> Quote(Guid invoiceItemId, CancellationToken ct)
    {
        var staff = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!staff && !User.IsInRole("Member")) return Forbid();
        return Ok(new { systemCalculatedPoints = await refunds.QuoteAsync(invoiceItemId, User.RequireUserId(), staff, ct) });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePointRefundRequest request,
        CancellationToken cancellationToken)
    {
        var canRequestForAnotherUser = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!canRequestForAnotherUser && !User.IsInRole("Member"))
            return Forbid();
        var result = await refunds.RequestAsync(request.InvoiceItemId, request.Reason, User.RequireUserId(),
            canRequestForAnotherUser, cancellationToken);
        return Ok(result);
    }

    /// <summary>Hủy ghi danh lớp: Member tự hủy (hoặc Lễ tân/Manager hủy thay) thì không được hoàn ở mọi thời điểm (BR-122).</summary>
    [HttpPost("class-cancellations")]
    public async Task<IActionResult> CancelClass([FromBody] CancelClassEnrollmentRequest request,
        CancellationToken cancellationToken)
    {
        var staff = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!staff && !User.IsInRole("Member")) return Forbid();
        return Ok(await refunds.CancelClassEnrollmentAsync(request.InvoiceItemId, User.RequireUserId(), staff,
            cancellationToken));
    }

    /// <summary>Hủy Membership đang hiệu lực: Member tự hủy thì không được hoàn ở mọi thời điểm (BR-91).</summary>
    [HttpPost("membership-cancellations")]
    public async Task<IActionResult> CancelMembership([FromBody] CancelClassEnrollmentRequest request,
        CancellationToken cancellationToken)
    {
        var staff = User.IsInRole("Receptionist") || User.IsInRole("CenterManager");
        if (!staff && !User.IsInRole("Member")) return Forbid();
        return Ok(await refunds.CancelMembershipAsync(request.InvoiceItemId, User.RequireUserId(), staff,
            cancellationToken));
    }

    [Authorize(Policy = SportHubPolicies.RefundApprove)]
    [HttpGet("{adjustmentId:guid}/approval-quote")]
    public async Task<IActionResult> ApprovalQuote(Guid adjustmentId, [FromQuery] bool centerFault = false,
        CancellationToken cancellationToken = default)
        => Ok(await refunds.ApprovalQuoteAsync(adjustmentId, centerFault, User.RequireUserId(), cancellationToken));

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
