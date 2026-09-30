using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

[ApiController]
[Route("api/gym-checkins")]
public class GymCheckInsController(IGymCheckInService gymCheckInService) : ControllerBase
{
    [Authorize(Policy = GymCheckInPolicies.Create)]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateGymCheckInRequest request,
        CancellationToken cancellationToken)
    {
        // Người check-in lấy từ claim, không từ body — xem CreateGymCheckInRequest.
        var result = await gymCheckInService.CreateAsync(
            request.TargetMemberId!.Value,
            User.RequireUserId(),
            cancellationToken);

        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Lễ tân ghi giờ ra (giờ server). Idempotent: check-out lần hai trả bản ghi cũ, không ghi đè.</summary>
    [Authorize(Policy = GymCheckInPolicies.Create)]
    [HttpPost("{checkInId:guid}/checkout")]
    public async Task<IActionResult> CheckOut(Guid checkInId, CancellationToken cancellationToken)
        => Ok(await gymCheckInService.CheckOutAsync(checkInId, User.RequireUserId(), cancellationToken));
}
