using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

/// <summary>
/// Khóa học theo môn nhóm. Công chúng chỉ thấy khóa đã publish (không có chi phí/ngưỡng). Manager soạn/publish/hủy.
/// Không có endpoint ghi danh: ghi danh chỉ sinh từ checkout thanh toán thành công.
/// </summary>
[ApiController]
public class ClassesController(IClassService classes, IClassSessionService sessions) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("api/classes")]
    public async Task<IActionResult> ListPublic(
        [FromQuery] int? sportId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await classes.ListPublicAsync(sportId, page, pageSize, ct));

    [AllowAnonymous]
    [HttpGet("api/classes/{classId:int}")]
    public async Task<IActionResult> GetPublic(int classId, CancellationToken ct)
        => Ok(await classes.GetPublicAsync(classId, ct));

    /// <summary>Lịch buổi của khóa: Manager/Lễ tân xem mọi khóa; Coach chỉ khóa mình phụ trách.</summary>
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("api/classes/{classId:int}/sessions")]
    public async Task<IActionResult> ListSessions(int classId, CancellationToken ct)
        => Ok(await sessions.ListByClassAsync(classId, CoachScope(), ct));

    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("api/coaches/me/classes")]
    public async Task<IActionResult> MyClasses(CancellationToken ct)
        => Ok(await classes.ListForCoachAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("api/manager/classes")]
    public async Task<IActionResult> ListManager(
        [FromQuery] string? status, [FromQuery] int? sportId, [FromQuery] string? keyword,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await classes.ListManagerAsync(status, sportId, keyword, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("api/manager/classes/{classId:int}")]
    public async Task<IActionResult> GetManager(int classId, CancellationToken ct)
        => Ok(await classes.GetManagerAsync(classId, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("api/manager/classes")]
    public async Task<IActionResult> Create([FromBody] SaveClassRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await classes.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("api/manager/classes/{classId:int}")]
    public async Task<IActionResult> Update(int classId, [FromBody] SaveClassRequest request, CancellationToken ct)
        => Ok(await classes.UpdateAsync(classId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("api/manager/classes/{classId:int}/publish")]
    public async Task<IActionResult> Publish(int classId, [FromBody] PublishClassRequest? request, CancellationToken ct)
        => Ok(await classes.PublishAsync(classId, request ?? new PublishClassRequest(), User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("api/manager/classes/{classId:int}/cancel")]
    public async Task<IActionResult> Cancel(int classId, [FromBody] CancelClassRequest request, CancellationToken ct)
        => Ok(await classes.CancelAsync(classId, request, User.RequireUserId(), ct));

    private Guid? CoachScope()
        => User.IsInRole(SportHubRoleNames.Coach) ? User.RequireUserId() : null;
}
