using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

/// <summary>Manager xem/sửa hồ sơ Coach, chuyên môn theo môn (BR-96) và cấp quyền dịch vụ PT. Tạo Coach là việc của SystemAdministrator (POST api/users/admin/staff).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CoachManagement)]
[Route("api/manager/coaches")]
public class CoachesController(CoachAdminService coaches, CoachQualificationService qualifications) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? keyword,
        [FromQuery] int? sportId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await coaches.SearchAsync(keyword, sportId, page, pageSize, ct));

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct) => Ok(await coaches.GetAsync(userId, ct));

    /// <summary>OfferingId các dịch vụ Coach đủ điều kiện dạy (hiện chỉ PT của Gym).</summary>
    [HttpGet("{userId:guid}/service-qualifications")]
    public async Task<IActionResult> GetQualifications(Guid userId, CancellationToken ct)
        => Ok(new { offeringIds = await qualifications.GetAsync(userId, ct) });

    [HttpPut("{userId:guid}/service-qualifications")]
    public async Task<IActionResult> SetQualifications(Guid userId, [FromBody] SetCoachQualificationsRequest request, CancellationToken ct)
        => Ok(new { offeringIds = await qualifications.ReplaceAsync(userId, request.OfferingIds, User.RequireUserId(), ct) });

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> Update(Guid userId, [FromBody] UpdateCoachRequest request, CancellationToken ct)
        => Ok(await coaches.UpdateAsync(userId, request, User.RequireUserId(), ct));
}
