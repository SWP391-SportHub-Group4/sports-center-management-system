using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Administration.Api;

/// <summary>Read-only coverage queue; changes use the shared class/session scheduling workflows.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager), Route("api/manager/coach-coverage")]
public sealed class CoachCoverageController(ISportHubDbContext db, IClock clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var locked = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Role!.RoleName == UserRole.Coach && x.Status != UserStatus.Active)
            .Select(x => new { x.UserId, x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email }).ToListAsync(ct);
        var result = new List<CoachCoverageItem>();
        foreach (var coach in locked)
        {
            var classes = await db.Set<Class>().AsNoTracking()
                .Where(x => x.CoachId == coach.UserId && x.Status != ClassStatus.Completed && x.Status != ClassStatus.Cancelled)
                .Select(x => new CoachCoverageClass(x.ClassId, x.Name, x.SportId)).ToListAsync(ct);
            var sessions = await db.Set<ClassSession>().AsNoTracking()
                .Where(x => x.CoachId == coach.UserId && x.Status == ClassSessionStatus.Scheduled && x.StartAtUtc > now
                    && (x.Class!.Status == ClassStatus.Published || x.Class.Status == ClassStatus.InProgress))
                .OrderBy(x => x.StartAtUtc)
                .Select(x => new CoachCoverageSession(x.SessionId, x.ClassId, x.StartAtUtc, x.EndAtUtc,
                    x.SessionNo, x.RoomId, x.Room!.Name, x.CoachId, x.Class!.CoachId != coach.UserId)).ToListAsync(ct);
            var relationships = await db.Set<CoachMemberRelationship>().AsNoTracking()
                .CountAsync(x => x.CoachId == coach.UserId && x.Status == RelationshipStatus.Active, ct);
            if (classes.Count == 0 && sessions.Count == 0 && relationships == 0) continue;
            result.Add(new(coach.UserId, coach.Name, coach.Email,
                classes.Select(x => x.ClassId).Concat(sessions.Select(x => x.ClassId)).Distinct().Count(),
                sessions.Count, relationships, classes, sessions));
        }
        return Ok(result.OrderBy(x => x.Sessions.FirstOrDefault()?.StartAtUtc ?? DateTime.MaxValue).ThenBy(x => x.CoachName));
    }
}

public sealed record CoachCoverageSession(Guid SessionId, int ClassId, DateTime StartAtUtc, DateTime EndAtUtc,
    int SessionNo, int RoomId, string RoomName, Guid CoachId, bool IsSubstitute);
public sealed record CoachCoverageClass(int ClassId, string Name, int SportId);
public sealed record CoachCoverageItem(Guid CoachId, string CoachName, string CoachEmail,
    int AffectedClasses, int FutureSessions, int ActiveRelationships,
    IReadOnlyList<CoachCoverageClass> MainClasses, IReadOnlyList<CoachCoverageSession> Sessions);
