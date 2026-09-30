using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Khóa phòng theo khung giờ. Xem: Manager và Lễ tân; ghi: Manager. Xung đột trả 409 kèm danh sách, không tự hủy lịch.</summary>
[ApiController]
[Authorize]
public class RoomBlocksController(RoomBlockService blocks) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("api/manager/room-blocks")]
    public async Task<IActionResult> List(
        [FromQuery] int? roomId, [FromQuery] DateTime? fromUtc, [FromQuery] DateTime? toUtc, CancellationToken ct)
        => Ok(await blocks.ListAsync(roomId, fromUtc, toUtc, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/room-blocks")]
    public async Task<IActionResult> Create([FromBody] CreateRoomBlockRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await blocks.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpDelete("api/manager/room-blocks/{blockId:guid}")]
    public async Task<IActionResult> Delete(Guid blockId, CancellationToken ct)
    {
        await blocks.DeleteAsync(blockId, User.RequireUserId(), ct);
        return NoContent();
    }
}
