using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Catalog.Api;

/// <summary>Môn thể thao (BR-106/107). Công khai chỉ đọc môn đang hoạt động; Manager ghi.</summary>
[ApiController]
public class SportsController(SportCatalogService sports) : ControllerBase
{
    /// <summary>Landing page: danh sách môn đang hoạt động, không cần đăng nhập.</summary>
    [AllowAnonymous]
    [HttpGet("api/sports")]
    public async Task<IActionResult> ListActive([FromQuery] string? service, CancellationToken ct)
        => Ok(await sports.ListAsync(includeInactive: false, ct, ParseService(service)));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpGet("api/manager/sports")]
    public async Task<IActionResult> ListAll([FromQuery] string? service, CancellationToken ct)
        => Ok(await sports.ListAsync(includeInactive: true, ct, ParseService(service)));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports")]
    public async Task<IActionResult> Create([FromBody] SaveSportRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sports.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/sports/{sportId:int}")]
    public async Task<IActionResult> Update(int sportId, [FromBody] SaveSportRequest request, CancellationToken ct)
        => Ok(await sports.UpdateAsync(sportId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/deactivate")]
    public async Task<IActionResult> Deactivate(int sportId, CancellationToken ct)
        => Ok(await sports.DeactivateAsync(sportId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/activate")]
    public async Task<IActionResult> Activate(int sportId, CancellationToken ct)
        => Ok(await sports.ActivateAsync(sportId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/services/{serviceType}/enable")]
    public async Task<IActionResult> EnableService(int sportId, string serviceType, CancellationToken ct)
        => Ok(await sports.SetServiceEnabledAsync(sportId, RequireService(serviceType), true, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPost("api/manager/sports/{sportId:int}/services/{serviceType}/disable")]
    public async Task<IActionResult> DisableService(int sportId, string serviceType, CancellationToken ct)
        => Ok(await sports.SetServiceEnabledAsync(sportId, RequireService(serviceType), false, User.RequireUserId(), ct));

    /// <summary>Thu hẹp loại phòng cho dịch vụ PT (chỉ PT hỗ trợ). Tập rỗng nghĩa là PT không gắn phòng.</summary>
    [Authorize(Policy = SportHubPolicies.CatalogManage)]
    [HttpPut("api/manager/sports/{sportId:int}/services/{serviceType}/room-types")]
    public async Task<IActionResult> SetServiceRoomTypes(int sportId, string serviceType,
        [FromBody] SetServiceRoomTypesRequest request, CancellationToken ct)
        => Ok(new { roomTypeIds = await sports.SetServiceRoomTypesAsync(sportId, RequireService(serviceType), request.RoomTypeIds, User.RequireUserId(), ct) });

    private static SportServiceType? ParseService(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : RequireService(value);

    private static SportServiceType RequireService(string value)
        => WireEnum.TryParse<SportServiceType>(WireEnum.ToInternalName(value) ?? value, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new BadRequestException("service_type_invalid", "Loại dịch vụ không hợp lệ.");
}
