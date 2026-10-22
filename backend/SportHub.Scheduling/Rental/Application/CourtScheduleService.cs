using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Rental.Application;

public sealed class CourtScheduleService(ISportHubDbContext db, IUserAccessReader users,
    IClassSessionService sessions)
{
    public async Task<IReadOnlyList<CourtScheduleEntry>> GetAsync(DateOnly fromDate, DateOnly toDate,
        int? roomId, Guid actorId, CancellationToken ct = default, Guid? memberId = null)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is null || !actor.IsActive || actor.Role is not ("CenterManager" or "Receptionist" or "Coach"))
            throw new ForbiddenException("court_schedule_forbidden", "Court schedule forbidden.");
        if (toDate < fromDate || toDate.DayNumber - fromDate.DayNumber > 30)
            throw new BadRequestException("invalid_range", "Invalid range.");
        var from = VietnamTime.StartOfDayUtc(fromDate);
        var to = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var coachScope = actor.Role == "Coach" ? actorId : (Guid?)null;
        var rows = await db.Set<ClassSession>().AsNoTracking()
            .Where(x => x.StartAtUtc < to && x.EndAtUtc > from && (roomId == null || x.RoomId == roomId)
                && (coachScope == null || x.Class!.CoachId == coachScope)
                && (memberId == null || db.Set<Enrollment>().Any(e => e.ClassId == x.ClassId
                    && e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null)))
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
                row.CoachId, await Name(row.CoachId), row.Name, row.Status.ToString(), row.ClassId,
                roster.Entries.Where(x => memberId == null || x.MemberId == memberId)
                    .Select(x => new CourtScheduleParticipant(x.MemberId, x.MemberName, x.EnrollmentId,
                    x.AttendanceStatus, x.AttendanceRecordedAt)).ToList()));
        }
        // Coaches receive only their assigned classes.
        if (coachScope is not null) return result.OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceId).ToList();
        var rentals = await db.Set<CourtRental>().AsNoTracking().Where(x => x.StartAtUtc < to && x.EndAtUtc > from
            && (roomId == null || x.RoomId == roomId)
            && (memberId == null || x.MemberId == memberId)).ToListAsync(ct);
        foreach (var rental in rentals)
            result.Add(new("CourtRental", rental.CourtRentalId, rental.RoomId, rental.StartAtUtc, rental.EndAtUtc,
                null, null, "Court rental", rental.Status.ToString(),
                null, [], rental.MemberId, await Name(rental.MemberId)));
        if (memberId is not null) return result.OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceId).ToList();
        var blocks = await db.Set<RoomBlock>().AsNoTracking().Where(x => x.StartAtUtc < to && x.EndAtUtc > from
            && (roomId == null || x.RoomId == roomId)).ToListAsync(ct);
        var incidentIds = blocks.Where(x => x.IncidentId != null).Select(x => x.IncidentId!.Value).Distinct().ToList();
        var incidents = await db.Set<IncidentNotice>().AsNoTracking()
            .Where(x => incidentIds.Contains(x.IncidentId)).ToDictionaryAsync(x => x.IncidentId, ct);
        var incidentRooms = await db.Set<RoomBlock>().AsNoTracking()
            .Where(x => x.IncidentId != null && incidentIds.Contains(x.IncidentId.Value))
            .Select(x => new { x.IncidentId, x.RoomId }).ToListAsync(ct);
        result.AddRange(blocks.Select(x => new CourtScheduleEntry("RoomBlock", x.BlockId, x.RoomId,
            x.StartAtUtc, x.EndAtUtc, null, null, x.Reason, "Blocked", null, [])
        {
            IncidentId = x.IncidentId,
            IncidentScope = x.IncidentId is Guid id && incidents.TryGetValue(id, out var incident)
                ? incident.Scope.ToString() : null,
            AffectedRoomIds = incidentRooms.Where(r => r.IncidentId == x.IncidentId)
                .Select(r => r.RoomId).Distinct().Order().ToList()
        }));
        return result.OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceType).ThenBy(x => x.SourceId).ToList();
    }
}
