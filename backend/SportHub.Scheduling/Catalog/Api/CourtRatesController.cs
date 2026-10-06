using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Bảng giá thuê sân (BR-127). Đọc khung đang hoạt động: người đã đăng nhập (Member cần xem giá); ghi: Manager.</summary>
[ApiController]
[Authorize]
public class CourtRatesController(CourtRateService rates) : ControllerBase
{
    [HttpGet("api/court-rates")]
    public async Task<IActionResult> List([FromQuery] int? roomTypeId, CancellationToken ct)
        => Ok(await rates.ListAsync(roomTypeId, includeInactive: false, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpGet("api/manager/court-rates")]
    public async Task<IActionResult> ListAll([FromQuery] int? roomTypeId, CancellationToken ct)
        => Ok(await rates.ListAsync(roomTypeId, includeInactive: true, ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/court-rates")]
    public async Task<IActionResult> Create([FromBody] SaveCourtRateRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await rates.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/court-rates/{rateId:int}")]
    public async Task<IActionResult> Update(int rateId, [FromBody] SaveCourtRateRequest request, CancellationToken ct)
        => Ok(await rates.UpdateAsync(rateId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpDelete("api/manager/court-rates/{rateId:int}")]
    public async Task<IActionResult> Delete(int rateId, CancellationToken ct)
    {
        await rates.DeleteAsync(rateId, User.RequireUserId(), ct);
        return NoContent();
    }
}
