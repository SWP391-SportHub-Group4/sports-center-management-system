using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Membership.Application.Commands;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Application.Services;

namespace SportHub.Membership.Api;

/// <summary>
/// Hồ sơ tập luyện — đầu vào bắt buộc của gợi ý AI (BR-26).
/// Hội viên tự khai hồ sơ của mình; Coach chỉ ĐỌC (không có endpoint ghi cho Coach —
/// đây là mục tiêu cá nhân của hội viên, không phải nhận xét của HLV).
/// </summary>
[ApiController]
[Authorize]
[Route("api")]
public class TrainingProfilesController(IMemberTrainingProfileService profiles) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/training-profile")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var profile = await profiles.GetAsync(User.RequireUserId(), ct);

        // 204 thay vì 404: "chưa khai hồ sơ" là trạng thái bình thường của hội viên mới,
        // không phải lỗi tra cứu sai id.
        return profile is null ? NoContent() : Ok(profile);
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPut("members/me/training-profile")]
    public async Task<IActionResult> SaveMine([FromBody] SaveTrainingProfileRequest request, CancellationToken ct)
        => Ok(await profiles.SaveAsync(User.RequireUserId(), request, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("members/{memberId:guid}/training-profile")]
    public async Task<IActionResult> GetByMember(Guid memberId, CancellationToken ct)
    {
        var profile = await profiles.GetAsync(memberId, ct);

        return profile is null ? NoContent() : Ok(profile);
    }
}
