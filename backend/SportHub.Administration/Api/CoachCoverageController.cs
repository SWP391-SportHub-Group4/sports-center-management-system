using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Administration.Api;

/// <summary>Live coverage queue. A locked coach remains visible until future sessions and active relationships are handled.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager), Route("api/manager/coach-coverage")]
public sealed class CoachCoverageController(ISportHubDbContext db, CourseValidator validator,
    IAuditWriter audit, INotificationWriter notifications, IUserAccessReader users,
    ICoachRelationshipRegistrar relationships, SportHub.BuildingBlocks.SharedKernel.Time.IClock clock) : ControllerBase
{
    [HttpPost("{coachId:guid}/classes/{classId:int}/reassign-main")]
    public async Task<IActionResult> ReassignMain(Guid coachId, int classId,
        [FromBody] ReassignMainCoachRequest request, CancellationToken ct)
    {
        if (request.ReplacementCoachId == coachId || string.IsNullOrWhiteSpace(request.Reason)
            || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("invalid_coach_reassignment", "Choose another coach and provide a reason.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var cls = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (cls.CoachId != coachId || cls.Status is ClassStatus.Completed or ClassStatus.Cancelled)
            throw new ConflictException("coach_assignment_changed", "The main coach assignment has changed.");
        var former = await db.Set<UserAccount>().AsNoTracking().SingleAsync(x => x.UserId == coachId, ct);
        if (former.Status == UserStatus.Active)
            throw new ConflictException("coach_not_locked", "This workflow is for a locked coach.");
        await validator.RequireCoachForSportAsync(request.ReplacementCoachId, cls.SportId, ct);
        cls.CoachId = request.ReplacementCoachId;
        cls.Version++;
        audit.Write(new AuditEntry(User.RequireUserId(), "REASSIGN_LOCKED_MAIN_COACH", nameof(Class),
            classId.ToString(), OldValue: JsonSerializer.Serialize(new { coachId }),
            NewValue: JsonSerializer.Serialize(new { coachId = request.ReplacementCoachId }), Reason: request.Reason.Trim()));
        var replacement = await users.GetAsync(request.ReplacementCoachId, ct);
        var formerAccess = await users.GetAsync(coachId, ct);
        var message = $"Course {cls.Name}: main coach changed from {formerAccess?.FullName ?? former.Email} to {replacement?.FullName ?? request.ReplacementCoachId.ToString()}. "
            + $"Reason: {request.Reason.Trim()}. Existing enrollment remains valid. Individual session times, rooms and teaching assignments are unchanged; review the session schedule for any separate updates.";
        await db.SaveChangesAsync(ct);
        var memberIds = await db.Set<Enrollment>().Where(e => e.ClassId == classId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => e.MemberId).Distinct().OrderBy(id => id).ToListAsync(ct);
        await new ClassScheduleEffects(db, users, notifications, audit, clock)
            .NotifyRecipientsAsync(memberIds.Concat(new[] { coachId, request.ReplacementCoachId }),
                NotificationEvents.CoachCoverageRequired, Guid.NewGuid(), message, ct);
        foreach (var memberId in memberIds)
            await relationships.EnsureClassBasedAsync(request.ReplacementCoachId, memberId, classId, ct);
        await db.SaveChangesAsync(ct);
        await relationships.ReconcileAsync(null, coachId, User.RequireUserId(),
            "No remaining active courses after main coach reassignment.", ct);
        await tx.CommitAsync(ct);
        return NoContent();
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var lockedCoaches = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Role!.RoleName == UserRole.Coach && x.Status != UserStatus.Active)
            .Select(x => new { x.UserId, x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .ToListAsync(ct);
        var result = new List<CoachCoverageItem>();
        foreach (var coach in lockedCoaches)
        {
            var mainClasses = await db.Set<Class>().AsNoTracking()
                .Where(x => x.CoachId == coach.UserId && x.Status != ClassStatus.Completed
                    && x.Status != ClassStatus.Cancelled)
                .Select(x => new CoachCoverageClass(x.ClassId, x.Name, x.SportId)).ToListAsync(ct);
            var sessions = await db.Set<ClassSession>().AsNoTracking()
                .Where(x => x.CoachId == coach.UserId && x.Status == ClassSessionStatus.Scheduled && x.StartAtUtc > now)
                .OrderBy(x => x.StartAtUtc)
                .Select(x => new CoachCoverageSession(x.SessionId, x.ClassId, x.StartAtUtc))
                .ToListAsync(ct);
            var activeRelationships = await db.Set<CoachMemberRelationship>().AsNoTracking()
                .CountAsync(x => x.CoachId == coach.UserId && x.Status == RelationshipStatus.Active, ct);
            if (mainClasses.Count == 0 && sessions.Count == 0 && activeRelationships == 0) continue;
            result.Add(new CoachCoverageItem(coach.UserId, coach.Name, coach.Email,
                mainClasses.Select(x => x.ClassId).Concat(sessions.Select(x => x.ClassId)).Distinct().Count(),
                sessions.Count, activeRelationships, mainClasses, sessions));
        }
        return Ok(result.OrderBy(x => x.Sessions.FirstOrDefault()?.StartAtUtc ?? DateTime.MaxValue)
            .ThenBy(x => x.CoachName).ToArray());
    }
}

public sealed record CoachCoverageSession(Guid SessionId, int ClassId, DateTime StartAtUtc);
public sealed record CoachCoverageClass(int ClassId, string Name, int SportId);
public sealed record ReassignMainCoachRequest(Guid ReplacementCoachId, string Reason);
public sealed record CoachCoverageItem(Guid CoachId, string CoachName, string CoachEmail,
    int AffectedClasses, int FutureSessions, int ActiveRelationships,
    IReadOnlyList<CoachCoverageClass> MainClasses, IReadOnlyList<CoachCoverageSession> Sessions);
