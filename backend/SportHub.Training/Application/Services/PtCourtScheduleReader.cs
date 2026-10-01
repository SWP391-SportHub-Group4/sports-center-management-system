using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.Training.Application.Services;

public sealed class PtCourtScheduleReader(ISportHubDbContext db,
    SportHub.BuildingBlocks.Abstractions.Identity.IUserAccessReader users) : IPtCourtScheduleReader
{
    public async Task<IReadOnlyList<CourtScheduleEntry>> ReadAsync(DateTime fromUtc, DateTime toUtc,
        int? roomId, CancellationToken ct = default)
    {
        var sessions = await db.Set<PtSession>().AsNoTracking()
            .Where(x => x.StartAtUtc < toUtc && x.EndAtUtc > fromUtc && (roomId == null || x.RoomId == roomId))
            .Select(x => new { x.SessionId, x.RoomId, x.StartAtUtc, x.EndAtUtc, x.CoachId,
                x.MemberId,
                x.Status, x.CompletedAt }).ToListAsync(ct);
        var names = new Dictionary<Guid, string>();
        foreach (var id in sessions.SelectMany(x => new[] { x.CoachId, x.MemberId }).Distinct())
            names[id] = (await users.GetAsync(id, ct))?.FullName ?? "";
        return sessions.Select(x => new CourtScheduleEntry("PtSession", x.SessionId, x.RoomId,
            x.StartAtUtc, x.EndAtUtc, x.CoachId, names[x.CoachId], "Personal Training", x.Status.ToString(),
            null, 1, [new(x.MemberId, names[x.MemberId], null,
                x.Status == PtSessionStatus.Completed ? "Completed" : x.Status == PtSessionStatus.NoShow ? "NoShow" : null,
                x.CompletedAt)])).ToList();
    }
}
