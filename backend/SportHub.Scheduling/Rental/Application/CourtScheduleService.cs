using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed class CourtScheduleService(ISportHubDbContext db, IUserAccessReader users,
    IClassSessionService sessions, IPtCourtScheduleReader pt)
{
    public async Task<IReadOnlyList<CourtScheduleEntry>> GetAsync(DateOnly fromDate, DateOnly toDate,
        int? roomId, Guid actorId, CancellationToken ct = default)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is null || !actor.IsActive || actor.Role is not ("CenterManager" or "Receptionist" or "Coach"))
            throw new ForbiddenException("court_schedule_forbidden", "Tài khoản không được xem lịch sân nội bộ.");
        if (toDate < fromDate || toDate.DayNumber - fromDate.DayNumber > 30)
            throw new BadRequestException("invalid_range", "Lịch sân tối đa 31 ngày, ngày kết thúc không trước ngày bắt đầu.");
        var from = VietnamTime.StartOfDayUtc(fromDate);
        var to = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var coachScope = actor.Role == "Coach" ? actorId : (Guid?)null;
        var rows = await db.Set<ClassSession>().AsNoTracking()
            .Where(x => x.StartAtUtc < to && x.EndAtUtc > from && (roomId == null || x.RoomId == roomId)
                && (coachScope == null || x.Class!.CoachId == coachScope))
            .Select(x => new { x.SessionId, x.ClassId, x.RoomId, x.StartAtUtc, x.EndAtUtc,
                x.CoachId, x.Status, x.Class!.Name }).ToListAsync(ct);
        var result = new List<CourtScheduleEntry>();
        var names = new Dictionary<Guid, string>();
        async Task<string> Name(Guid id)
        {
            if (!names.TryGetValue(id, out var name)) names[id] = name = (await users.GetAsync(id, ct))?.FullName ?? "";
            return name;
        }
        foreach (var row in rows)
        {
            var roster = await sessions.GetRosterAsync(row.SessionId, coachScope, ct);
            result.Add(new("ClassSession", row.SessionId, row.RoomId, row.StartAtUtc, row.EndAtUtc,
                row.CoachId, await Name(row.CoachId), row.Name, row.Status.ToString(), row.ClassId, null,
                roster.Entries.Select(x => new CourtScheduleParticipant(x.MemberId, x.MemberName, x.EnrollmentId,
                    x.AttendanceStatus, x.AttendanceRecordedAt)).ToList()));
        }
        // Coaches receive only their classes. Their PT calendar has its existing owner-scoped endpoint.
        if (coachScope is not null) return result.OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceId).ToList();
        result.AddRange(await pt.ReadAsync(from, to, roomId, ct));
        var rentals = await db.Set<CourtRental>().AsNoTracking().Where(x => x.StartAtUtc < to && x.EndAtUtc > from
            && (roomId == null || x.RoomId == roomId)).ToListAsync(ct);
        foreach (var rental in rentals)
            result.Add(new("CourtRental", rental.CourtRentalId, rental.RoomId, rental.StartAtUtc, rental.EndAtUtc,
                rental.ExternalCoachId, await Name(rental.ExternalCoachId), "Thuê sân", rental.Status.ToString(),
                null, rental.ExpectedAttendees, []));
        var blocks = await db.Set<RoomBlock>().AsNoTracking().Where(x => x.StartAtUtc < to && x.EndAtUtc > from
            && (roomId == null || x.RoomId == roomId)).ToListAsync(ct);
        result.AddRange(blocks.Select(x => new CourtScheduleEntry("RoomBlock", x.BlockId, x.RoomId,
            x.StartAtUtc, x.EndAtUtc, null, null, x.Reason, "Blocked", null, null, [])));
        return result.OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceType).ThenBy(x => x.SourceId).ToList();
    }
}
