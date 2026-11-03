using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

[ApiController]
[Route("api/members")]
public class MemberGymCheckInsController(IGymCheckInService gymCheckInService) : ControllerBase
{
    /// <summary>Lịch sử Gym check-in của chính người gọi.</summary>
    [Authorize(Policy = GymCheckInPolicies.ReadSelf)]
    [HttpGet("me/gym-checkins")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = GymCheckInService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        // memberId từ JWT: route "me" không nhận id nên Member không đọc được của người khác.
        var result = await gymCheckInService.GetHistoryAsync(
            User.RequireUserId(),
            page,
            pageSize,
            cancellationToken);

        return Ok(result);
    }

    /// <summary>Lễ tân/Quản lý tra cứu lịch sử của một Member.</summary>
    /// <remarks>
    /// Ràng buộc :guid trên route giữ cho "me" ở action phía trên không khớp vào đây,
    /// nên hai endpoint không nhập nhằng.
    /// </remarks>
    [Authorize(Policy = GymCheckInPolicies.ReadAny)]
    [HttpGet("{memberId:guid}/gym-checkins")]
    public async Task<IActionResult> GetByMember(
        Guid memberId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = GymCheckInService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await gymCheckInService.GetHistoryAsync(memberId, page, pageSize, cancellationToken);

        return Ok(result);
    }
}
