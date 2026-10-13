using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

public sealed record ResolveCheckInCodeRequest(string? Code);

[ApiController]
[Route("api/members")]
public class MemberCheckInCodesController(MemberCheckInCodeService codes) : ControllerBase
{
    /// <summary>Member lấy mã QR check-in của chính mình (server ký, hết hạn cuối ngày giờ VN).</summary>
    [Authorize(Roles = "Member")]
    [HttpGet("me/checkin-code")]
    public IActionResult GetMine() => Ok(codes.Issue(User.RequireUserId()));

    /// <summary>Lễ tân/Quản lý đổi mã QR đã quét thành memberId; mã giả hoặc hết hạn bị từ chối.</summary>
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("checkin-code/resolve")]
    public IActionResult Resolve([FromBody] ResolveCheckInCodeRequest request)
        => Ok(new { memberId = codes.Resolve(request.Code) });
}
