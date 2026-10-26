using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Api;

/// <summary>
/// Quản trị tài khoản — BR-2 (tạo tài khoản nhân sự, gán vai trò), BR-6 (khóa/mở khóa),
/// BR-7 (audit kèm lý do). Toàn bộ endpoint ghi đều là quyền của System Administrator.
/// </summary>
[ApiController]
[Authorize]
[Route("api/users")]
public class UsersController(IUserAdminService users, ICoachMemberAccessReader coachAccess) : ControllerBase
{

    /// <summary>
    /// Danh sách tài khoản. SystemAdministrator dùng để quản trị; Lễ tân/Quản lý cần tra
    /// hội viên khi bán gói hay đăng ký hộ.
    /// </summary>

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? keyword,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await users.SearchAsync(keyword,
            User.IsInRole(nameof(UserRole.Receptionist)) ? nameof(UserRole.Member) : role,
            status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpGet("/api/manager/people")]
    public async Task<IActionResult> People([FromQuery] string? keyword, [FromQuery] string? role,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await users.SearchAsync(keyword, role, null, page, pageSize, ct, peopleOnly: true));

    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpGet("admin")]
    public async Task<IActionResult> SearchForAdmin(
        [FromQuery] string? keyword,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = null)
        => Ok(await users.SearchAsync(keyword, role, status, page, pageSize, ct, sortBy, sortDirection));
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpGet("admin/{userId:guid}")]
    public async Task<IActionResult> GetForAdmin(
        Guid userId,
        CancellationToken ct)
        => Ok(await users.GetAsync(userId, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct)
    {
        var account = await users.GetAsync(userId, ct);
        if (User.IsInRole(nameof(UserRole.Receptionist)) && account.Role != nameof(UserRole.Member))
            return NotFound();
        if (User.IsInRole(nameof(UserRole.Coach)) &&
            !await coachAccess.HasActiveRelationshipAsync(User.RequireUserId(), userId, ct))
            return Forbid();

        return Ok(account);
    }

    /// <summary>BR-2 — chỉ System Administrator tạo tài khoản nhân sự.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost]
    [HttpPost("admin/staff")]
    public async Task<IActionResult> CreateStaff(
        [FromBody] CreateStaffAccountRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await users.CreateStaffAsync(request, User.RequireUserId(), ct));

    /// <summary>Gửi lại link kích hoạt cho staff chưa kích hoạt (cooldown 60 giây, link cũ bị vô hiệu).</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/resend-activation")]
    public async Task<IActionResult> ResendActivation(Guid userId, CancellationToken ct)
        => Ok(await users.ResendActivationAsync(userId, User.RequireUserId(), ct));

    /// <summary>Sửa email của staff chưa kích hoạt và gửi link mới tới email đó.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPut("{userId:guid}/email")]
    public async Task<IActionResult> ChangePendingEmail(
        Guid userId, [FromBody] ChangePendingStaffEmailRequest request, CancellationToken ct)
        => Ok(await users.ChangePendingEmailAsync(userId, request, User.RequireUserId(), ct));

    /// <summary>BR-2 — System Administrator lưu vai trò hoặc chuyên môn của Coach hiện tại.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPut("{userId:guid}/role")]
    public async Task<IActionResult> ChangeRole(
        Guid userId, [FromBody] ChangeUserRoleRequest request, CancellationToken ct)
        => Ok(await users.ChangeRoleAsync(userId, request, User.RequireUserId(), ct));

    /// <summary>Deactivate an account with a reason. The lock route remains for older clients.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/deactivate")]
    [HttpPost("{userId:guid}/lock")]
    public async Task<IActionResult> Deactivate(
        Guid userId, [FromBody] ChangeAccountStatusRequest request, CancellationToken ct)
        => Ok(await users.SetStatusAsync(userId, UserStatus.Deactivated, request.Reason, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/activate")]
    [HttpPost("{userId:guid}/unlock")]
    public async Task<IActionResult> Activate(
        Guid userId, [FromBody] ChangeAccountStatusRequest request, CancellationToken ct)
        => Ok(await users.SetStatusAsync(userId, UserStatus.Active, request.Reason, User.RequireUserId(), ct));
}
