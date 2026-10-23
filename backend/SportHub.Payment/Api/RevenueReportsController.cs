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
public class RevenueReportsController(IRevenueReportService revenue, ReportReconciliationService reconciliation) : ControllerBase
{
    [HttpGet("revenue-dimensions")]
    public async Task<IActionResult> Dimensions(
        [FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate,
        [FromQuery] int? sportId, [FromQuery] string? source, [FromQuery] Guid? memberId,
        CancellationToken ct = default)
    {
        var report = await revenue.GetAsync(fromDate, toDate, ct, sportId, source, memberId);
        var rows = report.BySportAndSource;
        return Ok(new { report.FromDate, report.ToDate, Rows = rows,
            CashCollected = rows.Sum(r => r.CashCollected), PointsRedeemedVnd = rows.Sum(r => r.PointsRedeemed) * 1000m });
    }

    [HttpGet("court-rental-revenue")]
    public async Task<IActionResult> GetCourtRentalRevenue(
        [FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, CancellationToken ct = default)
    {
        var report = await revenue.GetAsync(fromDate, toDate, ct);
        return Ok(new { report.FromDate, report.ToDate,
            Rows = report.BySportAndSource.Where(x => x.Source == "Rental").ToList() });
    }

    /// <summary>
    /// Recomputes every headline figure straight from invoices, payments, the point ledger and refunds and reports any
    /// delta, plus paid invoices whose cash/points disagree with their payments. Run before trusting an export.
    /// </summary>
    [HttpGet("revenue/reconciliation")]
    public async Task<IActionResult> Reconcile(
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, CancellationToken ct = default)
    {
        var to = toDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        return Ok(await reconciliation.ReconcileAsync(fromDate ?? to.AddDays(-29), to, ct));
    }

    /// <summary>BR-32/BR-43 — chỉ Center Manager; số liệu đã trừ điều chỉnh hoàn thành trong kỳ.</summary>
    [HttpGet("revenue")]
    public async Task<IActionResult> GetRevenue(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] int? sportId, [FromQuery] string? source, [FromQuery] Guid? memberId,
        CancellationToken ct = default)
    {
        var to = toDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var from = fromDate ?? to.AddDays(-29);

        // Chặn khoảng quá dài: báo cáo trả về từng ngày nên 5 năm sẽ là gần 2000 dòng JSON.
        if (to.DayNumber - from.DayNumber > 366)
        {
            throw new BadRequestException("range_too_large", "The revenue report range cannot exceed 366 days.");
        }

        return Ok(await revenue.GetAsync(from, to, ct, sportId, source, memberId));
    }
}
