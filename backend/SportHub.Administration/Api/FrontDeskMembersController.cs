using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;

namespace SportHub.Administration.Api;

/// <summary>Đăng ký Member mới tại quầy (Receptionist/Manager). Chỉ tạo role Member; staff chỉ do SystemAdministrator tạo (BR-2).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.FrontDesk)]
[Route("api/members/front-desk")]
public class FrontDeskMembersController(FrontDeskMemberService members) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFrontDeskMemberRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await members.CreateAsync(request, User.RequireUserId(), ct));

    [HttpPost("{userId:guid}/resend-activation")]
    public async Task<IActionResult> ResendActivation(Guid userId, CancellationToken ct)
        => Ok(await members.ResendActivationAsync(userId, User.RequireUserId(), ct));

    [HttpPut("{userId:guid}/email")]
    public async Task<IActionResult> ChangePendingEmail(
        Guid userId, [FromBody] ChangePendingMemberEmailRequest request, CancellationToken ct)
        => Ok(await members.ChangePendingEmailAsync(userId, request, User.RequireUserId(), ct));
}
