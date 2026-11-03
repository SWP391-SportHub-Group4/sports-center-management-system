using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Scheduling.Application.Services;

public sealed record ClassChangeOutcome(string Action, Guid SessionId, int SessionNo,
    DateTime StartAtUtc, DateTime EndAtUtc, Guid CoachId, string? CoachName,
    int RoomId, string? RoomName, string? HandledBy, string Reason, string Source = "DECISION",
    string SessionStatus = "Scheduled");

internal static class ClassChangeOutcomeSnapshot
{
    public static async Task<string> CaptureAsync(ISportHubDbContext db, IUserAccessReader users,
        Guid sessionId, Guid actorId, string action, string reason, CancellationToken ct)
    {
        // Identity resolution keeps the in-transaction schedule changes, including
        // reschedules that have not been flushed yet, rather than re-reading old times.
        var session = await db.Set<ClassSession>().AsTracking().SingleAsync(s => s.SessionId == sessionId, ct);
        var roomName = await db.Set<Room>().Where(r => r.RoomId == session.RoomId)
            .Select(r => r.Name).SingleOrDefaultAsync(ct);
        var coach = await users.GetAsync(session.CoachId, ct);
        var manager = await users.GetAsync(actorId, ct);
        return JsonSerializer.Serialize(new ClassChangeOutcome(action, session.SessionId, session.SessionNo,
            session.StartAtUtc, session.EndAtUtc, session.CoachId, coach?.FullName, session.RoomId,
            roomName, manager?.FullName, reason, "DECISION", session.Status.ToString()));
    }
}
