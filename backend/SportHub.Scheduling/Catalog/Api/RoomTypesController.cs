using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Loại phòng/sân và tương thích môn (BR-108). Mọi người đã đăng nhập đọc được; Manager ghi.</summary>
[ApiController]
[Authorize]
public class RoomTypesController(RoomTypeService roomTypes) : ControllerBase
{
    [HttpGet("api/room-types")]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await roomTypes.ListAsync(ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/room-types")]
    public async Task<IActionResult> Create([FromBody] SaveRoomTypeRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await roomTypes.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/room-types/{roomTypeId:int}")]
    public async Task<IActionResult> Rename(int roomTypeId, [FromBody] SaveRoomTypeRequest request, CancellationToken ct)
        => Ok(await roomTypes.RenameAsync(roomTypeId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/room-types/{roomTypeId:int}/sports")]
    public async Task<IActionResult> SetSports(int roomTypeId, [FromBody] SetRoomTypeSportsRequest request, CancellationToken ct)
        => Ok(await roomTypes.SetSportsAsync(roomTypeId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpDelete("api/manager/room-types/{roomTypeId:int}")]
    public async Task<IActionResult> Delete(int roomTypeId, CancellationToken ct)
    {
        await roomTypes.DeleteAsync(roomTypeId, User.RequireUserId(), ct);
        return NoContent();
    }
}
