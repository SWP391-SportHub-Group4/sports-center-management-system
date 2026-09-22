using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports")]
public class RevenueReportsController(IRevenueReportService revenue) : ControllerBase
{
    /// <summary>BR-32/BR-43 — chỉ Center Manager; số liệu đã trừ điều chỉnh hoàn thành trong kỳ.</summary>
    [HttpGet("revenue")]
    public async Task<IActionResult> GetRevenue(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken ct = default)
    {
        var to = toDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var from = fromDate ?? to.AddDays(-29);

        // Chặn khoảng quá dài: báo cáo trả về từng ngày nên 5 năm sẽ là gần 2000 dòng JSON.
        if (to.DayNumber - from.DayNumber > 366)
        {
            throw new BadRequestException("range_too_large", "Khoảng báo cáo tối đa 366 ngày.");
        }

        return Ok(await revenue.GetAsync(from, to, ct));
    }
}
