using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Api;

/// <summary>ExternalCoach tự đăng ký/xem hồ sơ, Manager duyệt (BR-105). Role không bao giờ nhận từ body.</summary>
[ApiController]
public class ExternalCoachesController(IExternalCoachService service) : ControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("auth-register-otp")]
    [HttpPost("api/auth/external-coach/otp")]
    public async Task<IActionResult> RequestOtp([FromBody] RequestRegisterOtpRequest request, CancellationToken ct)
    {
        await service.RequestRegisterOtpAsync(request, ct);
        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth-register")]
    [HttpPost("api/auth/external-coach/register")]
    public async Task<IActionResult> Register([FromBody] RegisterExternalCoachRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await service.RegisterAsync(request, ct));

    /// <summary>Hồ sơ và trạng thái duyệt của chính mình — xem được ở mọi trạng thái.</summary>
    [Authorize(Policy = SportHubPolicies.ExternalCoach)]
    [HttpGet("api/external-coaches/me")]
    public async Task<IActionResult> GetMe(CancellationToken ct)
        => Ok(await service.GetMeAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.ExternalCoach)]
    [HttpPut("api/external-coaches/me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateExternalCoachProfileRequest request, CancellationToken ct)
        => Ok(await service.UpdateMeAsync(User.RequireUserId(), request, ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpGet("api/manager/external-coaches")]
    public async Task<IActionResult> Search(
        [FromQuery] string? status,
        [FromQuery] string? keyword,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await service.SearchAsync(status, keyword, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpGet("api/manager/external-coaches/{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct)
        => Ok(await service.GetAsync(userId, ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpPost("api/manager/external-coaches/{userId:guid}/approve")]
    public async Task<IActionResult> Approve(Guid userId, [FromBody] ReviewExternalCoachRequest request, CancellationToken ct)
        => Ok(await service.ApproveAsync(userId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpPost("api/manager/external-coaches/{userId:guid}/reject")]
    public async Task<IActionResult> Reject(Guid userId, [FromBody] ReviewExternalCoachRequest request, CancellationToken ct)
        => Ok(await service.RejectAsync(userId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpPost("api/manager/external-coaches/{userId:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid userId, [FromBody] ReviewExternalCoachRequest request, CancellationToken ct)
        => Ok(await service.SuspendAsync(userId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CoachManagement)]
    [HttpPost("api/manager/external-coaches/{userId:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(Guid userId, [FromBody] ReviewExternalCoachRequest request, CancellationToken ct)
        => Ok(await service.ReactivateAsync(userId, request, User.RequireUserId(), ct));
}
