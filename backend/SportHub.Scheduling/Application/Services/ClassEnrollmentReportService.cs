using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Báo cáo sĩ số theo khóa (canonical: GET /api/reports/class-enrollment). Confirmed và giữ chỗ Active tách riêng: giữ chỗ chưa trả tiền
/// KHÔNG tính vào lấp đầy/ngưỡng hoàn vốn. Chỉ tính khóa đã publish trở đi (Draft chưa có sĩ số).
/// </summary>
public sealed class ClassEnrollmentReportService(ISportHubDbContext db) : IClassEnrollmentReportService
{
    public const int MaximumRangeDays = 366;

    public async Task<ClassEnrollmentReportResponse> GetAsync(
        DateOnly fromDate, DateOnly toDate, int? sportId, CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            throw new BadRequestException("invalid_date_range", "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        }

        if (toDate.DayNumber - fromDate.DayNumber > MaximumRangeDays)
        {
            throw new BadRequestException("range_too_large", $"Khoảng báo cáo tối đa {MaximumRangeDays} ngày.");
        }

        var query = db.Set<Class>().AsNoTracking()
            .Where(c => c.Status != ClassStatus.Draft && c.StartDate >= fromDate && c.StartDate <= toDate);

        if (sportId is int sid)
        {
            query = query.Where(c => c.SportId == sid);
        }

        var rows = await query
            .OrderBy(c => c.StartDate).ThenBy(c => c.Code)
            .Select(c => new
            {
                c.ClassId, c.Code, c.Name, c.SportId, SportName = c.Sport!.Name, c.Status, c.Capacity, c.ConfirmedCount, c.ReservedCount,
                c.BreakEvenThreshold, c.ThresholdStatus,
                FirstStart = c.Sessions.Where(s => s.Status != ClassSessionStatus.Cancelled).Min(s => (DateTime?)s.StartAtUtc)
            })
            .ToListAsync(ct);

        var classes = rows.Select(r =>
        {
            var holds = r.ReservedCount - r.ConfirmedCount;
            return new ClassEnrollmentRowResponse(
                r.ClassId, r.Code, r.Name, r.SportId, r.SportName, r.Status.ToString(), r.Capacity, r.ConfirmedCount, holds,
                Math.Max(0, r.Capacity - r.ReservedCount),
                r.Capacity == 0 ? 0m : Math.Round((decimal)r.ConfirmedCount / r.Capacity, 4),
                r.BreakEvenThreshold, r.ThresholdStatus.ToString(), r.FirstStart);
        }).ToList();

        var capacity = classes.Sum(c => c.Capacity);
        var confirmed = classes.Sum(c => c.ConfirmedCount);

        return new ClassEnrollmentReportResponse(
            fromDate, toDate, classes.Count, capacity, confirmed, classes.Sum(c => c.ActiveHoldCount),
            capacity == 0 ? 0m : Math.Round((decimal)confirmed / capacity, 4), classes);
    }
}
