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
