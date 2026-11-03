using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Api;

public sealed record RecordedAttendanceDay(DateOnly Date, int UniqueMembers, int GymCheckIns, int ClassAttendances);
public sealed record RecordedAttendanceReport(DateOnly FromDate, DateOnly ToDate, IReadOnlyList<RecordedAttendanceDay> Daily);

/// <summary>Recorded presence, not estimated footfall or rental-party headcounts.</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports/recorded-attendance")]
public sealed class RecordedAttendanceReportsController(ISportHubDbContext db, IClock clock) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<RecordedAttendanceReport>> Get(
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);
        var from = fromDate ?? new DateOnly(today.Year, today.Month, 1);
        var to = toDate ?? today;
        if (to < from || to.DayNumber - from.DayNumber >= 366 || to > today)
            throw new BadRequestException("invalid_date_range", "Use a range of no more than 366 days ending today or earlier.");
        var start = VietnamTime.StartOfDayUtc(from);
        var end = VietnamTime.EndOfDayExclusiveUtc(to);
        // Select only identifiers and event times; no member profile data leaves this endpoint.
        var gym = await db.Set<GymCheckIn>().AsNoTracking()
            .Where(x => x.CheckInTime >= start && x.CheckInTime < end && x.CheckInTime <= now)
            .Select(x => new { x.MemberId, Time = x.CheckInTime }).ToListAsync(ct);
        var lessons = await db.Set<Attendance>().AsNoTracking()
            .Where(x => x.Status == AttendanceStatus.Present && x.Session!.StartAtUtc >= start
                && x.Session.StartAtUtc < end && x.Session.StartAtUtc <= now)
            .Select(x => new { x.Enrollment!.MemberId, Time = x.Session!.StartAtUtc }).ToListAsync(ct);
        // Session date, not the date the coach eventually entered/edited attendance.
        var gymByDay = gym.ToLookup(x => DateOnly.FromDateTime(VietnamTime.ToLocal(x.Time)));
        var lessonsByDay = lessons.ToLookup(x => DateOnly.FromDateTime(VietnamTime.ToLocal(x.Time)));
        var daily = new List<RecordedAttendanceDay>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var gymRows = gymByDay[day].ToArray();
            var classRows = lessonsByDay[day].ToArray();
            daily.Add(new(day, gymRows.Select(x => x.MemberId).Concat(classRows.Select(x => x.MemberId)).Distinct().Count(),
                gymRows.Length, classRows.Length));
        }
        return Ok(new RecordedAttendanceReport(from, to, daily));
    }
}
