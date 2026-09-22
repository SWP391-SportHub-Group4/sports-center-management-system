using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Application.Services;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Api;

public sealed class CancelMemberPackageRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

/// <summary>
/// Gói đã bán cho hội viên. Endpoint mua gói nằm ở module Payment (BR-30 — hoá đơn và gói
/// phải sinh cùng transaction).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
public class MemberPackagesController(IMemberPackageService memberPackages) : ControllerBase
{
    /// <summary>Self action — memberId lấy từ JWT, không nhận từ route.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/packages")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
        => Ok(await memberPackages.GetByMemberAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("members/{memberId:guid}/packages")]
    public async Task<IActionResult> GetByMember(Guid memberId, CancellationToken ct)
        => Ok(await memberPackages.GetByMemberAsync(memberId, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("member-packages")]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] string? keyword,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await memberPackages.SearchAsync(status, keyword, page, pageSize, ct));

    /// <summary>
    /// Huỷ gói. Chỉ quầy (Manager/Lễ tân) — hội viên tự huỷ gói đã mua sẽ chạm tới việc hoàn
    /// tiền, mà hoàn tiền bắt buộc đi qua PaymentAdjustment có Manager duyệt (BR-42).
    /// </summary>
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("member-packages/{memberPackageId:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid memberPackageId,
        [FromBody] CancelMemberPackageRequest request,
        CancellationToken ct)
        => Ok(await memberPackages.CancelAsync(memberPackageId, request.Reason, User.RequireUserId(), ct));
}
