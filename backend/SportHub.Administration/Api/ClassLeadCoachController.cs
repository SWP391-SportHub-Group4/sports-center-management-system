using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Administration.Api;

/// <summary>Changes the course lead and all remaining teaching assignments atomically.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/classes/{classId:int}/lead-coach")]
public sealed class ClassLeadCoachController(ISportHubDbContext db, IClock clock,
    ICoachSpecialtyReader coaches, IUserAccessReader users, CourseValidator validator,
    IClassSessionService sessions, ICoachRelationshipRegistrar relationships, IAuditWriter audit) : ControllerBase
{
    [HttpGet("candidates")]
    public async Task<IActionResult> Candidates(int classId, CancellationToken ct)
    {
        var cls = await LoadAsync(classId, ct);
        var remaining = await RemainingAsync(classId, ct);
        var eligible = new List<LeadCoachCandidate>();
        if (remaining.Count > 0)
        {
            var ids = await coaches.GetCoachIdsForSportAsync(cls.SportId, ct);
            foreach (var id in ids.Where(id => id != cls.CoachId))
            {
                if (await HasConflictAsync(id, remaining, ct)) continue;
                eligible.Add(new(id, (await users.GetAsync(id, ct))?.FullName ?? id.ToString()));
            }
        }
        return Ok(new { version = cls.Version, currentCoachId = cls.CoachId,
            remainingSessionCount = remaining.Count, coaches = eligible.OrderBy(c => c.FullName) });
    }

    [HttpPost]
    public async Task<IActionResult> Change(int classId, ChangeLeadCoachRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("invalid_coach_reassignment", "Provide a reason between 3 and 500 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Match ClassSessionService's lock order: schedule barrier, class, then sessions.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 1)", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var cls = await LoadAsync(classId, ct);
        if (cls.Version != request.ExpectedVersion || cls.CoachId == request.CoachId)
            throw new ConflictException("coach_assignment_changed", "The class has changed. Reload the coach list and try again.");
        await validator.RequireCoachForSportAsync(request.CoachId, cls.SportId, ct);
        var remaining = await RemainingAsync(classId, ct);
        if (remaining.Count == 0)
            throw new ConflictException("no_remaining_sessions", "There are no future scheduled sessions to reassign.");
        if (await HasConflictAsync(request.CoachId, remaining, ct))
            throw new ConflictException("coach_busy", "This coach is no longer available for every remaining session. Choose another coach.");
        var formerCoachId = cls.CoachId;
        foreach (var session in remaining)
            await sessions.RescheduleAsync(session.SessionId, new RescheduleSessionRequest {
                StartAtUtc = session.StartAtUtc, CoachId = request.CoachId, Reason = request.Reason.Trim()
            }, User.RequireUserId(), ct);
        cls.CoachId = request.CoachId;
        cls.Version++;
        audit.Write(new AuditEntry(User.RequireUserId(), "CHANGE_CLASS_LEAD_COACH", nameof(Class), classId.ToString(),
            OldValue: JsonSerializer.Serialize(new { coachId = formerCoachId }),
            NewValue: JsonSerializer.Serialize(new { coachId = request.CoachId, sessions = remaining.Select(s => s.SessionId) }),
            Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct);
        var members = await db.Set<Enrollment>().Where(e => e.ClassId == classId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => e.MemberId).Distinct().ToListAsync(ct);
        foreach (var member in members)
            await relationships.EnsureClassBasedAsync(request.CoachId, member, classId, ct);
        if (formerCoachId is Guid former)
            await relationships.ReconcileAsync(null, former, User.RequireUserId(), "Class lead coach changed.", ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return NoContent();
    }

    private async Task<Class> LoadAsync(int id, CancellationToken ct)
    {
        var cls = await db.Set<Class>().SingleOrDefaultAsync(c => c.ClassId == id, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
            throw new ConflictException("class_not_editable", "The lead coach can only be changed for published or in-progress classes.");
        return cls;
    }

    private Task<List<ClassSession>> RemainingAsync(int id, CancellationToken ct)
    {
        var now = clock.UtcNow;
        return db.Set<ClassSession>().Where(s => s.ClassId == id && s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > now)
            .OrderBy(s => s.StartAtUtc).ThenBy(s => s.SessionId).ToListAsync(ct);
    }

    private async Task<bool> HasConflictAsync(Guid coachId, List<ClassSession> remaining, CancellationToken ct)
    {
        foreach (var session in remaining)
            if (await db.Set<CoachOccupancy>().AsNoTracking().AnyAsync(o => o.IsActive && o.CoachId == coachId
                && o.StartAtUtc < session.EndAtUtc && o.EndAtUtc > session.StartAtUtc
                && !(o.SourceType == OccupancySourceType.ClassSession && o.SourceId == session.SessionId), ct))
                return true;
        return false;
    }
}

public sealed record LeadCoachCandidate(Guid CoachId, string FullName);
public sealed record ChangeLeadCoachRequest(Guid CoachId, int ExpectedVersion, string Reason);
