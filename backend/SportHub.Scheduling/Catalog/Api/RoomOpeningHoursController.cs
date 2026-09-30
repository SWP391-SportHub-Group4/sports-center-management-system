using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Giờ mở cửa của phòng (BR-109). Đọc: người đã đăng nhập; ghi: Manager.</summary>
[ApiController]
[Authorize]
public class RoomOpeningHoursController(RoomOpeningHourService openingHours) : ControllerBase
{
    [HttpGet("api/rooms/{roomId:int}/opening-hours")]
    public async Task<IActionResult> List(int roomId, CancellationToken ct) => Ok(await openingHours.ListAsync(roomId, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/rooms/{roomId:int}/opening-hours")]
    public async Task<IActionResult> Set(int roomId, [FromBody] SetOpeningHoursRequest request, CancellationToken ct)
        => Ok(await openingHours.SetAsync(roomId, request, User.RequireUserId(), ct));
}
