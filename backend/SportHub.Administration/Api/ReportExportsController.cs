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
