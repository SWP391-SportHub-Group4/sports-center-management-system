using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Reporting;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Api;

public sealed record CourtBookingSportRow(int SportId, string SportName, int Bookings, decimal BookedHours);
public sealed record CourtBookingReport(DateOnly FromDate, DateOnly ToDate, int TotalBookings,
    decimal TotalBookedHours, IReadOnlyList<CourtBookingSportRow> BySport)
{
    public IReadOnlyList<CourtBookingDay> Daily { get; init; } = [];
}
public sealed record CourtBookingDay(DateOnly Date, int Bookings, decimal BookedHours);

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/reports/court-bookings")]
public sealed class CourtBookingReportsController(ISportHubDbContext db, IClock clock,
    IPaidInvoiceReportReader payments) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<CourtBookingReport>> Get(
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate,
        [FromQuery] int? sportId, [FromQuery] Guid? memberId, CancellationToken ct)
    {
        var today = VietnamTime.TodayLocal(clock);
        var from = fromDate ?? new DateOnly(today.Year, today.Month, 1);
        var to = toDate ?? new DateOnly(today.Year, today.Month, DateTime.DaysInMonth(today.Year, today.Month));
        if (to < from || to.DayNumber - from.DayNumber >= 366)
            throw new BadRequestException("invalid_date_range", "Use a range of no more than 366 days.");
        return Ok(await CourtBookingReportReader.ReadAsync(db, payments, from, to, sportId, memberId, ct));
    }
}

public static class CourtBookingReportReader
{
    public static async Task<CourtBookingReport> ReadAsync(ISportHubDbContext db, IPaidInvoiceReportReader payments,
        DateOnly from, DateOnly to,
        int? sportId, Guid? memberId, CancellationToken ct)
    {
        var start = VietnamTime.StartOfDayUtc(from);
        var end = VietnamTime.EndOfDayExclusiveUtc(to);
        var rentals = await db.Set<CourtRental>().AsNoTracking()
            .Where(x => x.StartAtUtc >= start && x.StartAtUtc < end
                && ((x.InvoiceId.HasValue && payments.PaidInvoiceIds.Contains(x.InvoiceId.Value))
                    || (x.InvoiceItemId.HasValue && payments.PaidInvoiceItemIds.Contains(x.InvoiceItemId.Value)))
                && (!sportId.HasValue || x.SportId == sportId) && (!memberId.HasValue || x.MemberId == memberId))
            .Select(x => new { x.SportId, x.StartAtUtc, x.EndAtUtc }).ToListAsync(ct);
        var sportIds = rentals.Select(x => x.SportId).Distinct().ToArray();
        // Show every active catalog sport, including new sports with no paid rentals,
        // as well as inactive sports that still have historical paid bookings.
        var sports = await db.Set<Sport>().AsNoTracking()
            .Where(s => (!sportId.HasValue || s.SportId == sportId)
                && (sportIds.Contains(s.SportId) || s.IsActive))
            .Select(s => new { s.SportId, s.Name }).ToListAsync(ct);
        var grouped = rentals.ToLookup(x => x.SportId);
        var rows = sports.Select(s => new CourtBookingSportRow(s.SportId, s.Name, grouped[s.SportId].Count(),
                grouped[s.SportId].Sum(x => Math.Max(0m, (decimal)(x.EndAtUtc - x.StartAtUtc).Ticks / TimeSpan.TicksPerHour))))
            .OrderByDescending(x => x.BookedHours).ThenBy(x => x.SportName).ToList();
        var days = rentals.ToLookup(x => DateOnly.FromDateTime(VietnamTime.ToLocal(x.StartAtUtc)));
        return new CourtBookingReport(from, to, rows.Sum(x => x.Bookings), rows.Sum(x => x.BookedHours), rows)
        {
            Daily = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1).Select(i =>
            {
                var date = from.AddDays(i);
                return new CourtBookingDay(date, days[date].Count(), days[date].Sum(x =>
                    Math.Max(0m, (decimal)(x.EndAtUtc - x.StartAtUtc).Ticks / TimeSpan.TicksPerHour)));
            }).ToList()
        };
    }
}
