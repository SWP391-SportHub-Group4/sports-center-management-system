using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Api;

/// <summary>
/// Quản trị tài khoản — BR-2 (tạo tài khoản nhân sự, gán vai trò), BR-6 (khóa/mở khóa),
/// BR-7 (audit kèm lý do). Toàn bộ endpoint ghi đều là quyền của System Administrator.
/// </summary>
[ApiController]
[Authorize]
[Route("api/users")]
public class UsersController(IUserAdminService users) : ControllerBase
{
    /// <summary>
    /// Danh sách tài khoản. SystemAdministrator dùng để quản trị; Lễ tân/Quản lý cần tra
    /// hội viên khi bán gói hay đăng ký hộ.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? keyword,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await users.SearchAsync(keyword, role, status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpGet("admin")]
    public async Task<IActionResult> SearchForAdmin(
        [FromQuery] string? keyword,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await users.SearchAsync(keyword, role, status, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct) => Ok(await users.GetAsync(userId, ct));

    /// <summary>BR-2 — chỉ System Administrator tạo tài khoản nhân sự.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost]
    public async Task<IActionResult> CreateStaff(
        [FromBody] CreateStaffAccountRequest request, CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created, await users.CreateStaffAsync(request, User.RequireUserId(), ct));

    /// <summary>BR-2 — chỉ System Administrator gán hoặc thay đổi vai trò.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPut("{userId:guid}/role")]
    public async Task<IActionResult> ChangeRole(
        Guid userId, [FromBody] ChangeUserRoleRequest request, CancellationToken ct)
        => Ok(await users.ChangeRoleAsync(userId, request, User.RequireUserId(), ct));

    /// <summary>BR-6/BR-7 — khóa tài khoản, bắt buộc kèm lý do và ghi audit.</summary>
    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/lock")]
    public async Task<IActionResult> Lock(
        Guid userId, [FromBody] ChangeAccountStatusRequest request, CancellationToken ct)
        => Ok(await users.SetStatusAsync(userId, UserStatus.Banned, request.Reason, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/unlock")]
    public async Task<IActionResult> Unlock(
        Guid userId, [FromBody] ChangeAccountStatusRequest request, CancellationToken ct)
        => Ok(await users.SetStatusAsync(userId, UserStatus.Active, request.Reason, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    [HttpPost("{userId:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid userId, [FromBody] ChangeAccountStatusRequest request, CancellationToken ct)
        => Ok(await users.SetStatusAsync(userId, UserStatus.Deactivated, request.Reason, User.RequireUserId(), ct));
}
