using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.AI.Application.Services.CoachPlanning;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.AI.Api;

public sealed record ClassSuggestionRequest(Guid? MemberId, string Goal, string Level, string Language = "en",
    string Scope = "session", Guid? SessionId = null);

[ApiController]
[Authorize(Policy = SportHubPolicies.Coach)]
[Route("api/coaches/me/teaching/classes/{classId:int}/suggestion")]
public sealed class ClassTeachingAiController(ClassTeachingService teaching, ISportHubDbContext db, SportHub.AI.Infrastructure.Python.PythonCoachPlanProvider provider, IClock clock, ILogger<ClassTeachingAiController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Suggest(int classId, ClassSuggestionRequest request, CancellationToken ct)
    {
        var cls = await teaching.RequireClassAsync(classId, User.RequireUserId(), ct);
        if (cls.CoachId != User.RequireUserId())
            throw new ForbiddenException("class_plan_not_assigned", "Only the assigned class coach can generate AI suggestions.");
        if (request.Level is not ("Beginner" or "Intermediate" or "Advanced") || request.Language is not ("vi" or "en")
            || request.Scope is not ("session" or "personal") || (request.Scope == "session" && (!request.SessionId.HasValue || request.MemberId.HasValue)) || (request.Scope == "personal" && !request.MemberId.HasValue)
            || request.SessionId == Guid.Empty || request.MemberId == Guid.Empty)
            throw new BadRequestException("suggestion_context_invalid", "Enter a goal and valid experience level.");
        var hardReject = AiPlanGoalGuard.RejectionReason(request.Goal);
        if (hardReject is not null)
            throw new BadRequestException("training_goal_invalid",
                "Invalid training goal. Please enter a meaningful sport-specific improvement objective.");
        var now = clock.UtcNow;
        ClassSession? selectedSession = null;
        if (request.SessionId.HasValue)
        {
            selectedSession = await db.Set<ClassSession>().AsNoTracking()
                .SingleOrDefaultAsync(x => x.ClassId == classId && x.SessionId == request.SessionId, ct)
                ?? throw new BadRequestException("session_not_in_class", "Session is not in this class.");
            if (selectedSession.Status != ClassSessionStatus.Scheduled || selectedSession.StartAtUtc <= now)
                throw new ConflictException("session_suggestion_unavailable", "AI suggestions are only available for upcoming sessions.");
            if (selectedSession.CoachId != User.RequireUserId())
                throw new ForbiddenException("session_not_assigned", "You are not assigned to this session.");
            if (selectedSession.EndAtUtc <= selectedSession.StartAtUtc)
                throw new ConflictException("session_suggestion_unavailable", "The session duration is invalid.");
        }
        if (request.MemberId.HasValue && !await db.Set<Enrollment>().AsNoTracking().AnyAsync(e => e.ClassId == classId
            && e.MemberId == request.MemberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        var generator = new CoachPlanGenerator(provider);
        var approvedDraft = await generator.GenerateAsync(cls.Sport!.Name, request.Goal, request.Level, request.Language, ct);
        logger.LogInformation("CoachPlan V2 model={Model} scope={Scope}", approvedDraft.Model, request.Scope);
        // The request may have taken seconds; prevent returning a draft for a newly inaccessible or started session.
        var actor = User.RequireUserId();
        var currentClass = await teaching.RequireClassAsync(classId, actor, ct);
        if (currentClass.CoachId != actor)
            throw new ForbiddenException("class_plan_not_assigned", "You are no longer assigned to this class.");
        var returnNow = clock.UtcNow;
        if (request.SessionId.HasValue && !await db.Set<ClassSession>().AsNoTracking().AnyAsync(s =>
            s.ClassId == classId && s.SessionId == request.SessionId && s.CoachId == actor
            && s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > returnNow
            && s.StartAtUtc == selectedSession!.StartAtUtc && s.EndAtUtc == selectedSession.EndAtUtc, ct))
            throw new ConflictException("session_suggestion_unavailable", "AI suggestions are only available for upcoming sessions.");
        if (request.MemberId.HasValue && !await db.Set<Enrollment>().AsNoTracking().AnyAsync(e => e.ClassId == classId
            && e.MemberId == request.MemberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        return Ok(new { content = approvedDraft.Answer, approvedDraft.Provider, approvedDraft.Model });
    }
}
