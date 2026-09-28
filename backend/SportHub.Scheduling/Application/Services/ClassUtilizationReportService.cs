using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Constants;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Báo cáo sử dụng lớp Yoga/Group X. PT không dùng Class/ClassSession nên không xuất hiện.
/// Cancelled và bản ghi Rescheduled cũ được trả trong status breakdown nhưng không tham gia
/// mẫu số utilization.
/// </summary>
public sealed class ClassUtilizationReportService(ISportHubDbContext db) : IClassUtilizationReportService
{
    public const int MaximumRangeDays = 366;

    public async Task<ClassUtilizationReportResponse> GetAsync(
        DateOnly fromDate,
        DateOnly toDate,
        string? discipline,
        CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            throw new BadRequestException("invalid_date_range", "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        }

        if (toDate.DayNumber - fromDate.DayNumber > MaximumRangeDays)
        {
            throw new BadRequestException(
                "range_too_large",
                $"Khoảng báo cáo tối đa {MaximumRangeDays} ngày.");
        }

        var normalizedDiscipline = string.IsNullOrWhiteSpace(discipline) ? null : discipline.Trim();

        if (normalizedDiscipline is not null
            && normalizedDiscipline != Disciplines.Yoga
            && normalizedDiscipline != Disciplines.GroupX)
        {
            throw new BadRequestException(
                "invalid_discipline",
                $"Bộ môn báo cáo phải là {Disciplines.Yoga} hoặc {Disciplines.GroupX}.");
        }

        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var query = db.Set<ClassSession>()
            .AsNoTracking()
            .Where(session => session.StartAtUtc >= fromUtc
                              && session.StartAtUtc < toUtc
                              && (session.Class!.Discipline == Disciplines.Yoga
                                  || session.Class.Discipline == Disciplines.GroupX));

        if (normalizedDiscipline is not null)
        {
            query = query.Where(session => session.Class!.Discipline == normalizedDiscipline);
        }

        var statusCounts = await query
            .GroupBy(session => session.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Status, item => item.Count, ct);

        var usable = query.Where(session => session.Status == ClassSessionStatus.Scheduled
                                            || session.Status == ClassSessionStatus.Completed);

        var totals = await usable
            .GroupBy(_ => 1)
            .Select(group => new
            {
                SessionCount = group.Count(),
                Capacity = group.Sum(session => session.Capacity),
                Confirmed = group.Sum(session => session.ConfirmedCount)
            })
            .SingleOrDefaultAsync(ct);

        var byClassRows = await usable
            .GroupBy(session => new
            {
                session.ClassId,
                session.Class!.Name,
                session.Class.Discipline
            })
            .Select(group => new
            {
                group.Key.ClassId,
                ClassName = group.Key.Name,
                group.Key.Discipline,
                SessionCount = group.Count(),
                Capacity = group.Sum(session => session.Capacity),
                Confirmed = group.Sum(session => session.ConfirmedCount)
            })
            .OrderBy(row => row.Discipline)
            .ThenBy(row => row.ClassName)
            .ToListAsync(ct);

        // UTC+7 cố định: cộng offset trước khi lấy Date để PostgreSQL group đúng calendar date VN.
        var dailyRows = await usable
            .GroupBy(session => session.StartAtUtc.AddHours(7).Date)
            .Select(group => new
            {
                LocalDate = group.Key,
                SessionCount = group.Count(),
                Capacity = group.Sum(session => session.Capacity),
                Confirmed = group.Sum(session => session.ConfirmedCount)
            })
            .OrderBy(row => row.LocalDate)
            .ToListAsync(ct);

        var totalCapacity = totals?.Capacity ?? 0;
        var totalConfirmed = totals?.Confirmed ?? 0;

        return new ClassUtilizationReportResponse(
            fromDate,
            toDate,
            statusCounts.Values.Sum(),
            statusCounts.GetValueOrDefault(ClassSessionStatus.Scheduled),
            statusCounts.GetValueOrDefault(ClassSessionStatus.Completed),
            statusCounts.GetValueOrDefault(ClassSessionStatus.Cancelled),
            statusCounts.GetValueOrDefault(ClassSessionStatus.Rescheduled),
            totalCapacity,
            totalConfirmed,
            Rate(totalConfirmed, totalCapacity),
            byClassRows.Select(row => new ClassUtilizationGroupResponse(
                row.ClassId,
                row.ClassName,
                row.Discipline,
                row.SessionCount,
                row.Capacity,
                row.Confirmed,
                Rate(row.Confirmed, row.Capacity))).ToList(),
            dailyRows.Select(row => new DailyClassUtilizationResponse(
                DateOnly.FromDateTime(row.LocalDate),
                row.SessionCount,
                row.Capacity,
                row.Confirmed,
                Rate(row.Confirmed, row.Capacity))).ToList());
    }

    private static decimal Rate(int confirmed, int capacity)
        => capacity == 0
            ? 0m
            : Math.Round(confirmed * 100m / capacity, 2, MidpointRounding.AwayFromZero);
}
