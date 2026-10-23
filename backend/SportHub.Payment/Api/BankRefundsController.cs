using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.BankRefunds;

namespace SportHub.Payment.Api;

/// <summary>
/// Hoàn tiền về tài khoản ngân hàng qua Support Request PAYMENT. Member chọn giao dịch và xem kết quả; Lễ tân xem (số tài khoản bị
/// che); chỉ CenterManager duyệt, từ chối, báo đối soát và ghi nhận đã chuyển khoản. Coach/Admin không có quyền.
/// </summary>
[ApiController]
[Authorize]
[Route("api/bank-refunds")]
public sealed class BankRefundsController(BankRefundService refunds, ISportHubDbContext db) : ControllerBase
{
    /// <summary>Giao dịch có thể yêu cầu hoàn tiền. Member xem của mình; nhân viên chọn Member trước (memberId).</summary>
    [HttpGet("items")]
    public async Task<IActionResult> Items([FromQuery] Guid? memberId, CancellationToken ct)
    {
        if (User.IsInRole(nameof(UserRole.Member)))
            return Ok(await refunds.ListRefundableItemsAsync(User.RequireUserId(), ct));
        if (!User.IsInRole(nameof(UserRole.Receptionist)) && !User.IsInRole(nameof(UserRole.CenterManager)))
            return Forbid();
        if (memberId is not Guid id)
            throw new BadRequestException("member_required", "Choose a member first.");
        var isMember = await db.Set<UserAccount>().AsNoTracking()
            .AnyAsync(x => x.UserId == id && x.Role != null && x.Role.RoleName == UserRole.Member, ct);
        if (!isMember) throw new NotFoundException("member_not_found", "Member was not found.");
        return Ok(await refunds.ListRefundableItemsAsync(id, ct));
    }

    /// <summary>Chi tiết hoàn tiền của một ticket: chủ ticket, hoặc Lễ tân/Manager.</summary>
    [HttpGet("by-request/{requestId:guid}")]
    public async Task<IActionResult> Get(Guid requestId, CancellationToken ct)
    {
        if (User.IsInRole(nameof(UserRole.CenterManager)))
            return Ok(await refunds.GetForStaffAsync(requestId, isManager: true, ct));
        if (User.IsInRole(nameof(UserRole.Receptionist)))
            return Ok(await refunds.GetForStaffAsync(requestId, isManager: false, ct));
        if (User.IsInRole(nameof(UserRole.Member)))
            return Ok(await refunds.GetForMemberAsync(requestId, User.RequireUserId(), ct));
        return Forbid();
    }

    [HttpGet]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] bool needsReconciliation = false,
        [FromQuery] int take = 100, CancellationToken ct = default)
        => Ok(await refunds.ListAsync(status, needsReconciliation, take, ct));

    [HttpPost("by-request/{requestId:guid}/approve")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    public async Task<IActionResult> Approve(Guid requestId, [FromBody] ApproveBankRefundRequest body, CancellationToken ct)
        => Ok(await refunds.ApproveAsync(requestId, User.RequireUserId(), body, ct));

    [HttpPost("by-request/{requestId:guid}/reject")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    public async Task<IActionResult> Reject(Guid requestId, [FromBody] RejectBankRefundRequest body, CancellationToken ct)
        => Ok(await refunds.RejectAsync(requestId, User.RequireUserId(), body.Reason, ct));

    [HttpPost("by-request/{requestId:guid}/flag-payout")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    public async Task<IActionResult> FlagPayout(Guid requestId, [FromBody] FlagBankRefundPayoutRequest body, CancellationToken ct)
        => Ok(await refunds.FlagPayoutAsync(requestId, User.RequireUserId(), body.Note, ct));

    /// <summary>Ghi nhận đã chuyển khoản ngoài hệ thống (số tiền, thời điểm, mã giao dịch, lý do, 1–3 ảnh chứng từ) → DONE.</summary>
    [HttpPost("by-request/{requestId:guid}/complete")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Complete(Guid requestId, [FromForm] CompleteBankRefundRequest body, CancellationToken ct)
        => Ok(await refunds.CompleteAsync(requestId, User.RequireUserId(), body, ct));
}
