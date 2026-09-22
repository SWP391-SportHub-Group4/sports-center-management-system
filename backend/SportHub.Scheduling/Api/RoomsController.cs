using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

/// <summary>Phòng tập — BR-39 (chỉ Center Manager cấu hình), BR-57 (tên duy nhất).</summary>
[ApiController]
[Authorize]
[Route("api/rooms")]
public class RoomsController(IRoomService rooms) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await rooms.GetAllAsync(ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveRoomRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await rooms.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{roomId:int}")]
    public async Task<IActionResult> Update(int roomId, [FromBody] SaveRoomRequest request, CancellationToken ct)
        => Ok(await rooms.UpdateAsync(roomId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpDelete("{roomId:int}")]
    public async Task<IActionResult> Delete(int roomId, CancellationToken ct)
    {
        await rooms.DeleteAsync(roomId, User.RequireUserId(), ct);

        return NoContent();
    }
}
