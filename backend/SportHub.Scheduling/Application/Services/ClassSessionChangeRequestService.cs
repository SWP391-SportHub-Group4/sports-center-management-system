using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using System.Text.Json;
using System.Text.Json.Serialization;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

public sealed record CreateClassChangeRequest(Guid RequestId, string Type, string Reason,
    DateTime? ProposedStartAtUtc = null, DateTime? ProposedEndAtUtc = null);
public sealed record ResolveClassChangeRequest(string Type, string ReviewNote, DateTime? StartAtUtc = null,
    int? RoomId = null, Guid? CoachId = null);
public sealed record RejectClassChangeRequest(string ReviewNote);
public sealed record ClassChangeResponse(Guid RequestId, Guid SessionId, int ClassId, string ClassName, int SportId,
    int SessionNo, Guid CoachId, string CoachName, string Type, string Reason, string Status,
    DateTime OriginalStartAtUtc, DateTime OriginalEndAtUtc, int OriginalRoomId,
    DateTime? ProposedStartAtUtc, DateTime? ProposedEndAtUtc, DateTime CreatedAtUtc,
    DateTime? ReviewedAtUtc, string? ReviewNote, string? ResolutionType, Guid? ResultSessionId,
    [property: JsonIgnore] string? OutcomeSnapshotJson = null)
{
    public ClassChangeOutcome? Outcome => OutcomeSnapshotJson == null
        ? null : JsonSerializer.Deserialize<ClassChangeOutcome>(OutcomeSnapshotJson);
}

public sealed class ClassSessionChangeRequestService(ISportHubDbContext db, IClassSessionService sessions,
    IUserAccessReader users, INotificationWriter notifications, IAuditWriter audit, IClock clock)
{
    private static bool ValidResolutionType(string type) => type is "SUBSTITUTE" or "RESCHEDULE" or "CANCEL_WITH_MAKEUP";
    // Older clients may still submit the former proposal types. New Coach requests
    // use ABSENCE; only the Manager chooses a concrete schedule resolution.
    private static bool ValidRequestType(string type) => type == "ABSENCE" || ValidResolutionType(type);
    private static string Reason(string? value) => value?.Trim() is { Length: >= 3 and <= 500 } text ? text
        : throw new BadRequestException("change_reason_required", "Change reason required.");

    private static Expression<Func<ClassSessionChangeRequest, ClassChangeResponse>> Projection() => r => new(
        r.RequestId, r.SessionId, r.Session.ClassId, r.Session.Class!.Name, r.Session.Class.SportId,
        r.Session.SessionNo, r.RequestedByUserId, r.RequestedBy.Profile == null ? r.RequestedBy.Email : r.RequestedBy.Profile.FullName,
        r.Type, r.Reason, r.Status, r.OriginalStartAtUtc, r.OriginalEndAtUtc, r.OriginalRoomId,
        r.ProposedStartAtUtc, r.ProposedEndAtUtc, r.CreatedAtUtc, r.ReviewedAtUtc, r.ReviewNote, r.ResolutionType, r.ResultSessionId, r.OutcomeSnapshotJson);

    public async Task<object> ListAsync(Guid? coachId, string? status, int? classId, Guid? filterCoachId, Guid? sessionId,
        int page, CancellationToken ct)
    {
        if (page < 1 || page > 10000 || (status != null && status is not ("PENDING" or "RESOLVED" or "REJECTED" or "WITHDRAWN")))
            throw new BadRequestException("change_filter_invalid", "Change filter invalid.");
        var query = db.Set<ClassSessionChangeRequest>().AsNoTracking();
        if (coachId.HasValue) query = query.Where(r => r.RequestedByUserId == coachId);
        if (status != null) query = query.Where(r => r.Status == status);
        if (classId.HasValue) query = query.Where(r => r.Session.ClassId == classId);
        if (filterCoachId.HasValue) query = query.Where(r => r.RequestedByUserId == filterCoachId);
        if (sessionId.HasValue) query = query.Where(r => r.SessionId == sessionId);
        var totalCount = await query.CountAsync(ct);
        var items = await query.OrderByDescending(r => r.CreatedAtUtc).ThenBy(r => r.RequestId)
            .Skip((page - 1) * 50).Take(50).Select(Projection()).ToListAsync(ct);
        return new { items = await WithLegacyOutcomesAsync(items, ct), page, pageSize = 50, totalCount };
    }

    public async Task<ClassChangeResponse> GetAsync(Guid id, Guid? coachId, CancellationToken ct)
    {
        var item = await db.Set<ClassSessionChangeRequest>().AsNoTracking()
            .Where(r => r.RequestId == id && (coachId == null || r.RequestedByUserId == coachId))
            .Select(Projection()).SingleOrDefaultAsync(ct)
        ?? throw new NotFoundException("class_change_not_found", "Class change not found.");
        return (await WithLegacyOutcomesAsync([item], ct))[0];
    }

    private async Task<IReadOnlyList<ClassChangeResponse>> WithLegacyOutcomesAsync(
        IReadOnlyList<ClassChangeResponse> items, CancellationToken ct)
    {
        // Older records have the resolution type but no historical schedule snapshot.
        // Return only the referenced session's current public schedule, explicitly
        // marked CURRENT_SCHEDULE; do not pretend these are details from review time.
        var ids = items.Where(r => r.OutcomeSnapshotJson == null && r.ResultSessionId != null
                && (r.Status == "RESOLVED" || r.ResolutionType == "SCHEDULE_UPDATED"))
            .Select(r => r.ResultSessionId!.Value).Distinct().ToArray();
        if (ids.Length == 0) return items;
        var sessions = await db.Set<ClassSession>().AsNoTracking().Where(s => ids.Contains(s.SessionId))
            .Select(s => new {
                s.SessionId, s.ClassId, s.SessionNo, s.StartAtUtc, s.EndAtUtc, s.CoachId, s.RoomId, s.Status,
                RoomName = s.Room == null ? null : s.Room.Name,
                CoachName = db.Set<UserAccount>().Where(u => u.UserId == s.CoachId)
                    .Select(u => u.Profile == null ? null : u.Profile.FullName).FirstOrDefault()
            }).ToDictionaryAsync(s => s.SessionId, ct);
        return items.Select(r => {
            if (r.OutcomeSnapshotJson != null || r.ResultSessionId is not Guid resultId
                || (r.Status != "RESOLVED" && r.ResolutionType != "SCHEDULE_UPDATED")
                || !sessions.TryGetValue(resultId, out var s) || s.ClassId != r.ClassId) return r;
            return r with { OutcomeSnapshotJson = JsonSerializer.Serialize(new ClassChangeOutcome(
                r.ResolutionType ?? "SCHEDULE_UPDATED", s.SessionId, s.SessionNo, s.StartAtUtc, s.EndAtUtc,
                s.CoachId, s.CoachName, s.RoomId, s.RoomName, null, r.ReviewNote ?? "", "CURRENT_SCHEDULE", s.Status.ToString())) };
        }).ToArray();
    }

    public async Task<object> FiltersAsync(CancellationToken ct)
    {
        var query = db.Set<ClassSessionChangeRequest>().AsNoTracking();
        var classes = await query.Select(r => new { classId = r.Session.ClassId, name = r.Session.Class!.Name }).Distinct().OrderBy(r => r.name).ToListAsync(ct);
        var coaches = await query.Select(r => new { coachId = r.RequestedByUserId, name = r.RequestedBy.Profile == null ? r.RequestedBy.Email : r.RequestedBy.Profile.FullName }).Distinct().OrderBy(r => r.name).ToListAsync(ct);
        return new { classes, coaches };
    }

    private async Task<ClassSession> LockSessionAsync(Guid sessionId, CancellationToken ct)
    {
        // Same lock order as all group schedule mutations: schedule lock, class, session, request.
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = (SELECT class_id FROM class_sessions WHERE session_id = {sessionId}) FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT session_id FROM class_sessions WHERE session_id = {sessionId} FOR UPDATE", ct);
        return await db.Set<ClassSession>().Include(s => s.Class).SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Session not found.");
    }

    private void EnsureEditable(ClassSession s)
    {
        if (s.Status != ClassSessionStatus.Scheduled || s.StartAtUtc <= clock.UtcNow || s.Class!.Status is ClassStatus.Draft or ClassStatus.Cancelled or ClassStatus.Completed)
            throw new ConflictException("session_not_editable", "Session not editable.");
    }

    private void ValidateProposal(ClassSession s, CreateClassChangeRequest input)
    {
        if (input.Type == "ABSENCE") {
            if (s.StartAtUtc - clock.UtcNow < TimeSpan.FromHours(6))
                throw new ConflictException("class_absence_deadline", "Absence requests must be submitted or edited at least 6 hours before the session starts. Contact your Manager directly for urgent absences.");
            if (input.ProposedStartAtUtc.HasValue || input.ProposedEndAtUtc.HasValue)
                throw new BadRequestException("absence_proposal_not_allowed", "The Manager chooses the replacement coach or new session time for an absence request.");
            return;
        }
        if (input.Type == "CANCEL_WITH_MAKEUP" && s.StartAtUtc - clock.UtcNow < TimeSpan.FromHours(6))
            throw new ConflictException("class_cancel_deadline", "Cancellation requests must be submitted at least 6 hours before the session starts.");
        if ((input.ProposedStartAtUtc.HasValue != input.ProposedEndAtUtc.HasValue)
            || (input.ProposedStartAtUtc.HasValue && (input.Type == "SUBSTITUTE" || input.ProposedStartAtUtc.Value.Kind != DateTimeKind.Utc
                || input.ProposedEndAtUtc!.Value.Kind != DateTimeKind.Utc || input.ProposedStartAtUtc <= clock.UtcNow
                || input.ProposedEndAtUtc - input.ProposedStartAtUtc != s.EndAtUtc - s.StartAtUtc)))
            throw new BadRequestException("proposed_time_invalid", "Proposed time invalid.");
    }

    public async Task<ClassChangeResponse> CreateAsync(Guid sessionId, Guid coachId, CreateClassChangeRequest input, CancellationToken ct)
    {
        var reason = Reason(input.Reason);
        if (input.RequestId == Guid.Empty || !ValidRequestType(input.Type))
            throw new BadRequestException("class_change_invalid", "Class change invalid.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var s = await LockSessionAsync(sessionId, ct);
        var actor = await users.GetAsync(coachId, ct);
        if (s.CoachId != coachId || actor is not { IsActive: true, Role: "Coach" })
            throw new ForbiddenException("session_not_assigned", "Session not assigned.");
        var existing = await db.Set<ClassSessionChangeRequest>().SingleOrDefaultAsync(r => r.RequestId == input.RequestId, ct);
        if (existing != null) {
            if (existing.RequestedByUserId != coachId || existing.SessionId != sessionId || existing.Type != input.Type || existing.Reason != reason || existing.ProposedStartAtUtc != input.ProposedStartAtUtc || existing.ProposedEndAtUtc != input.ProposedEndAtUtc)
                throw new ConflictException("change_retry_changed", "Change retry changed.");
            await tx.CommitAsync(ct); return await GetAsync(existing.RequestId, coachId, ct);
        }
        EnsureEditable(s);
        ValidateProposal(s, input);
        if (await db.Set<ClassSessionChangeRequest>().AnyAsync(r => r.SessionId == sessionId && r.Status == "PENDING", ct))
            throw new ConflictException("class_change_pending", "Class change pending.");
        var record = new ClassSessionChangeRequest { RequestId = input.RequestId, SessionId = sessionId,
            RequestedByUserId = coachId, Type = input.Type, Reason = reason, ProposedStartAtUtc = input.ProposedStartAtUtc,
            ProposedEndAtUtc = input.ProposedEndAtUtc, OriginalStartAtUtc = s.StartAtUtc, OriginalEndAtUtc = s.EndAtUtc,
            OriginalRoomId = s.RoomId, CreatedAtUtc = clock.UtcNow };
        db.Set<ClassSessionChangeRequest>().Add(record);
        var managers = await db.Set<UserAccount>().Where(u => u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.CenterManager).Select(u => u.UserId).ToListAsync(ct);
        foreach (var id in managers) notifications.Queue(new(id, NotificationEvents.ClassSessionChangeRequested,
            $"{actor.FullName} {(input.Type == "ABSENCE" ? "requested an absence for" : "requested a change to")} session {s.SessionNo} · {s.Class!.Name}. Reason: {reason}", record.RequestId));
        WriteAudit(coachId, "CREATE", record);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(record.RequestId, coachId, ct);
    }

    private async Task<(ClassSessionChangeRequest Request, ClassSession Session)> LockRequestAsync(Guid id, Guid? coachId, CancellationToken ct)
    {
        var sessionId = await db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id && (coachId == null || r.RequestedByUserId == coachId))
            .Select(r => (Guid?)r.SessionId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("class_change_not_found", "Class change not found.");
        var session = await LockSessionAsync(sessionId, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT request_id FROM class_session_change_requests WHERE request_id = {id} FOR UPDATE", ct);
        var record = await db.Set<ClassSessionChangeRequest>().SingleAsync(r => r.RequestId == id, ct);
        if (record.Status != "PENDING") throw new ConflictException("class_change_not_pending", "Class change not pending.");
        return (record, session);
    }

    public async Task<ClassChangeResponse> WithdrawAsync(Guid id, Guid coachId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (r, _) = await LockRequestAsync(id, coachId, ct);
        r.Status = "WITHDRAWN"; r.ReviewedAtUtc = clock.UtcNow;
        WriteAudit(coachId, "WITHDRAW", r);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(id, coachId, ct);
    }

    public async Task<ClassChangeResponse> ReviewAsync(Guid id, Guid managerId, ResolveClassChangeRequest? input, string? rejection, CancellationToken ct)
    {
        var note = Reason(input?.ReviewNote ?? rejection);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (r, s) = await LockRequestAsync(id, null, ct);
        var actor = await users.GetAsync(managerId, ct);
        if (actor is not { IsActive: true, Role: "CenterManager" } || managerId == r.RequestedByUserId)
            throw new ForbiddenException("manager_required", "Manager required.");
        if (input != null) {
            EnsureEditable(s);
            if (s.CoachId != r.RequestedByUserId || s.StartAtUtc != r.OriginalStartAtUtc || s.EndAtUtc != r.OriginalEndAtUtc || s.RoomId != r.OriginalRoomId)
                throw new ConflictException("class_change_stale", "Class change stale.");
            if (!ValidResolutionType(input.Type) || (input.Type != "SUBSTITUTE" && (!input.StartAtUtc.HasValue || input.StartAtUtc.Value.Kind != DateTimeKind.Utc))
                || (input.Type == "SUBSTITUTE" && (!input.CoachId.HasValue || input.CoachId == s.CoachId)))
                throw new BadRequestException("class_resolution_invalid", "Class resolution invalid.");
            r.Status = "RESOLVED"; r.ResolutionType = input.Type;
            if (input.Type == "CANCEL_WITH_MAKEUP") {
                var result = await sessions.CancelWithMakeupAsync(s.SessionId, new CancelSessionRequest { Reason = note,
                    Makeup = new() { StartAtUtc = input.StartAtUtc!.Value, RoomId = input.RoomId, CoachId = input.CoachId } }, managerId, ct);
                r.ResultSessionId = result.SessionId;
            } else {
                await sessions.RescheduleAsync(s.SessionId, new RescheduleSessionRequest {
                    StartAtUtc = input.Type == "SUBSTITUTE" ? s.StartAtUtc : input.StartAtUtc!.Value,
                    CoachId = input.CoachId, RoomId = input.Type == "SUBSTITUTE" ? s.RoomId : input.RoomId, Reason = note }, managerId, ct);
                r.ResultSessionId = s.SessionId;
            }
            r.OutcomeSnapshotJson = await ClassChangeOutcomeSnapshot.CaptureAsync(db, users,
                r.ResultSessionId!.Value, managerId, input.Type, note, ct);
        } else r.Status = "REJECTED";
        r.ReviewedByUserId = managerId; r.ReviewedAtUtc = clock.UtcNow; r.ReviewNote = note;
        await NotifyCoachAsync(r.RequestedByUserId, NotificationEvents.ClassSessionChangeReviewed, r.RequestId,
            $"Session change request {s.SessionNo} · {s.Class!.Name}: {r.Status}. {note}", ct,
            SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(
                ("Class", s.Class.Name), ("Session", s.SessionNo.ToString()),
                ("Decision", input == null ? "Rejected" : "Approved"), ("Manager's note", note)));
        WriteAudit(managerId, input == null ? "REJECT" : "RESOLVE", r);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(id, null, ct);
    }

    private async Task NotifyCoachAsync(Guid id, string type, Guid source, string message, CancellationToken ct, string? emailBody = null)
    {
        notifications.Queue(new(id, type, message, source));
        var user = await users.GetAsync(id, ct);
        if (user != null) notifications.QueueEmail(new(id, user.Email, type, source, "SportHub · Schedule change request",
            emailBody ?? SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(message)));
    }
    private void WriteAudit(Guid actor, string action, ClassSessionChangeRequest r) => audit.Write(new(actor,
        action + "_CLASS_SESSION_CHANGE_REQUEST", nameof(ClassSessionChangeRequest), r.RequestId.ToString(),
        NewValue: JsonSerializer.Serialize(new { r.SessionId, r.Type, r.Status, r.ResolutionType, r.ResultSessionId }), Reason: r.ReviewNote ?? r.Reason));
}
