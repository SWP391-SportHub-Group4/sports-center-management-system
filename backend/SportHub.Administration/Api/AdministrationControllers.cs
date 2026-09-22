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

/// <summary>Cấu hình toàn hệ thống — BR-39 (chỉ Center Manager).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/system-settings")]
public class SystemSettingsController(ISystemSettingService settings) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await settings.GetAllAsync(ct));

    [HttpPut("{key}")]
    public async Task<IActionResult> Update(
        string key, [FromBody] UpdateSystemSettingRequest request, CancellationToken ct)
        => Ok(await settings.UpdateAsync(key, request.Value, User.RequireUserId(), ct));
}

/// <summary>
/// Nhật ký thao tác (BR-7). Center Manager và System Administrator đều đọc được:
/// BR-7 nêu Manager "xem lịch sử thao tác", còn SysAdmin cần đối chiếu chính các thao tác
/// khóa/mở khóa mà BR-6 giao cho vai trò này.
/// </summary>
[ApiController]
[Authorize(Roles = nameof(UserRole.CenterManager) + "," + nameof(UserRole.SystemAdministrator))]
[Route("api/audit-logs")]
public class AuditLogsController(IAuditQueryService auditLogs) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? action,
        [FromQuery] string? targetEntity,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
        => Ok(await auditLogs.SearchAsync(action, targetEntity, fromUtc, toUtc, page, pageSize, ct));
}

/// <summary>Tệp xuất báo cáo — BR-44 → BR-48. Chỉ CSV; phần PDF của BR-48 chưa làm.</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports/exports")]
public class ReportExportsController(IReportExportService exports) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await exports.SearchAsync(
            User.RequireUserId(), User.IsInRole(SportHubRoleNames.CenterManager), page, pageSize, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReportExportRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await exports.CreateAsync(request, User.RequireUserId(), ct));

    [HttpGet("{reportExportId:guid}/download")]
    public async Task<IActionResult> Download(Guid reportExportId, CancellationToken ct)
    {
        var (fileName, content) = await exports.DownloadAsync(
            reportExportId, User.RequireUserId(), User.IsInRole(SportHubRoleNames.CenterManager), ct);

        // Content type suy ra từ đuôi file do service quyết định, không hard-code CSV:
        // trả PDF dưới nhãn text/csv thì trình duyệt mở ra rác.
        var contentType = fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
            ? "application/pdf"
            : "text/csv";

        return File(content, contentType, fileName);
    }

    [HttpPost("{reportExportId:guid}/retry")]
    public async Task<IActionResult> Retry(Guid reportExportId, CancellationToken ct)
        => Ok(await exports.RetryAsync(reportExportId, User.RequireUserId(), ct));

    [HttpDelete("{reportExportId:guid}")]
    public async Task<IActionResult> Delete(Guid reportExportId, CancellationToken ct)
    {
        await exports.DeleteAsync(
            reportExportId, User.RequireUserId(), User.IsInRole(SportHubRoleNames.CenterManager), ct);

        return NoContent();
    }
}
