using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Occupancy.Application;

namespace SportHub.Scheduling.Occupancy.Api;

/// <summary>
/// Gợi ý phòng/coach còn trống. Chỉ là gợi ý — đặt lịch vẫn chịu ràng buộc DB.
/// Phòng/coach trống: Manager, Lễ tân, Coach (không lộ ai đang chiếm). Danh sách khoảng bận có nguồn: chỉ Manager và Lễ tân.
/// </summary>
[ApiController]
[Authorize]
public class AvailabilityController(AvailabilityService availability) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("api/availability/rooms")]
    public async Task<IActionResult> FreeRooms(
        [FromQuery] int sportId, [FromQuery] DateTime startUtc, [FromQuery] DateTime endUtc, CancellationToken ct)
        => Ok(await availability.FreeRoomsAsync(sportId, startUtc, endUtc, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("api/availability/coaches")]
    public async Task<IActionResult> FreeCoaches(
        [FromQuery] int sportId, [FromQuery] DateTime startUtc, [FromQuery] DateTime endUtc, CancellationToken ct)
        => Ok(await availability.FreeCoachesAsync(sportId, startUtc, endUtc, ct));

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("api/availability/rooms/{roomId:int}/busy")]
    public async Task<IActionResult> RoomBusy(
        int roomId, [FromQuery] DateTime fromUtc, [FromQuery] DateTime toUtc, CancellationToken ct)
        => Ok(await availability.RoomBusyAsync(roomId, fromUtc, toUtc, ct));
}
