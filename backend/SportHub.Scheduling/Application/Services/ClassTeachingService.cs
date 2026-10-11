using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;

namespace SportHub.Scheduling.Application.Services;

public sealed record TeachingWriteRequest(Guid RecordId, string Kind, string Title, string Content,
    Guid? SessionId = null, Guid? MemberId = null, int? Score = null, DateTime? DueAtUtc = null, int Version = 0);
public sealed record TeachingMember(Guid MemberId, string MemberName, string Email, string? Goal,
    string? ExperienceLevel, string? Notes, int Present, int Absent);

public sealed class ClassTeachingService(ISportHubDbContext db, IUserAccessReader users,
    INotificationWriter notifications, IAuditWriter audit, IClock clock)
{
    public async Task<Class> RequireClassAsync(int classId, Guid coachId, CancellationToken ct)
    {
        var actor = await users.GetAsync(coachId, ct);
        if (actor is not { IsActive: true, Role: "Coach" })
            throw new ForbiddenException("coach_required", "Coach account is not active.");
        var cls = await db.Set<Class>().AsNoTracking().Include(x => x.Sport).SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (cls.CoachId != coachId && !await db.Set<ClassSession>().AnyAsync(x => x.ClassId == classId && x.CoachId == coachId, ct))
            throw new ForbiddenException("class_not_assigned", "You are not assigned to this class.");
        return cls;
    }

    public async Task<object> RecordsAsync(int classId, Guid actorId, bool member, int page, CancellationToken ct)
    {
        if (member) {
            if (!await db.Set<Enrollment>().AnyAsync(x => x.ClassId == classId && x.MemberId == actorId, ct))
                throw new ForbiddenException("class_not_enrolled", "You are not enrolled in this class.");
        } else await RequireClassAsync(classId, actorId, ct);
        if (page < 1 || page > 10000) throw new BadRequestException("invalid_page", "Invalid page.");
        var query = db.Set<ClassTeachingRecord>().AsNoTracking().Where(x => x.ClassId == classId);
        if (member) query = query.Where(x => x.MemberId == null || x.MemberId == actorId);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.RecordId)
            .Skip((page - 1) * 100).Take(100).ToListAsync(ct);
        return new { items, page, pageSize = 100, totalCount = total };
    }

    public async Task<IReadOnlyList<TeachingMember>> MembersAsync(int classId, Guid coachId, CancellationToken ct)
    {
        await RequireClassAsync(classId, coachId, ct);
        var ids = await db.Set<Enrollment>().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed)
            .Select(x => x.MemberId).Distinct().ToListAsync(ct);
        var profiles = await db.Set<MemberTrainingProfile>().AsNoTracking().Where(x => ids.Contains(x.MemberId)).ToDictionaryAsync(x => x.MemberId, ct);
        var attendance = await db.Set<Attendance>().AsNoTracking().Where(x => x.Enrollment!.ClassId == classId)
            .Select(x => new { x.Enrollment!.MemberId, x.Status }).ToListAsync(ct);
        var members = new List<TeachingMember>();
        foreach (var id in ids) {
            var user = await users.GetAsync(id, ct);
            profiles.TryGetValue(id, out var p);
            members.Add(new(id, user?.FullName ?? "", user?.Email ?? "", p?.Goal, p?.ExperienceLevel.ToString(), p?.Notes,
                attendance.Count(x => x.MemberId == id && x.Status == AttendanceStatus.Present),
                attendance.Count(x => x.MemberId == id && x.Status == AttendanceStatus.Absent)));
        }
        return members.OrderBy(x => x.MemberName).ToList();
    }

    public async Task<ClassTeachingRecord> SaveAsync(int classId, Guid coachId, TeachingWriteRequest request, bool update, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize class edits, publishing, enrollment and retries against the class row.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var cls = await RequireClassAsync(classId, coachId, ct);
        if (cls.Status is ClassStatus.Draft or ClassStatus.Cancelled)
            throw new ConflictException("class_not_active", "This class is not active.");
        var kind = request.Kind?.Trim().ToUpperInvariant();
        var title = request.Title?.Trim() ?? "";
        var content = request.Content?.Trim() ?? "";
        if (request.RecordId == Guid.Empty || kind is not ("PLAN" or "RESULT" or "NOTICE" or "HOMEWORK") || title.Length is < 1 or > 160 || content.Length is < 1 or > 8000 || request.Score is < 1 or > 5)
            throw new BadRequestException("teaching_invalid", "Enter a title, content and a valid assessment.");
        if (kind == "RESULT" && (!request.SessionId.HasValue || !request.MemberId.HasValue))
            throw new BadRequestException("result_scope_required", "Select a session and student.");
        if (kind != "RESULT" && request.Score.HasValue)
            throw new BadRequestException("score_result_only", "Assessment belongs to a session result.");
        if (request.MemberId.HasValue && !await db.Set<Enrollment>().AnyAsync(x => x.ClassId == classId && x.MemberId == request.MemberId && x.Status == EnrollmentStatus.Confirmed, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        if (request.SessionId.HasValue) {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT session_id FROM class_sessions WHERE session_id = {request.SessionId.Value} FOR UPDATE", ct);
            var session = await db.Set<ClassSession>().AsNoTracking().SingleOrDefaultAsync(x => x.SessionId == request.SessionId && x.ClassId == classId, ct)
                ?? throw new BadRequestException("session_not_in_class", "Session does not belong to this class.");
            if (session.CoachId != coachId) throw new ForbiddenException("session_not_assigned", "You are not assigned to this session.");
            if (session.Status == ClassSessionStatus.Cancelled) throw new ConflictException("session_cancelled", "Session is cancelled.");
            if (kind == "RESULT" && clock.UtcNow < session.StartAtUtc) throw new ConflictException("result_not_open", "Results can be recorded after the session starts.");
        } else if (cls.CoachId != coachId) throw new ForbiddenException("class_plan_not_assigned", "Only the assigned class coach can publish class content.");
        if (request.DueAtUtc.HasValue && (kind != "HOMEWORK" || request.DueAtUtc.Value.Kind != DateTimeKind.Utc || request.DueAtUtc <= clock.UtcNow))
            throw new BadRequestException("homework_due_invalid", "Homework deadline must be in the future (UTC).");
        var existing = await db.Set<ClassTeachingRecord>().SingleOrDefaultAsync(x => x.RecordId == request.RecordId, ct);
        if (existing != null && (existing.ClassId != classId || existing.CoachId != coachId))
            throw new ForbiddenException("record_not_owned", "Content belongs to another coach.");
        if (!update && existing != null) {
            if (existing.Kind != kind || existing.Title != title || existing.Content != content || existing.SessionId != request.SessionId || existing.MemberId != request.MemberId || existing.Score != request.Score || existing.DueAtUtc != request.DueAtUtc)
                throw new ConflictException("teaching_retry_changed", "Retry content differs from the saved record.");
            await tx.CommitAsync(ct);
            return existing;
        }
        if (update && (existing == null || existing.Version != request.Version))
            throw new ConflictException("teaching_stale", "Content has changed. Refresh before editing.");
        if (update && (existing!.Kind != kind || existing.SessionId != request.SessionId || existing.MemberId != request.MemberId || kind is "NOTICE" or "HOMEWORK"))
            throw new ConflictException("teaching_scope_locked", "Published messages and content scope cannot be changed.");
        if (!update && kind == "RESULT" && await db.Set<ClassTeachingRecord>().AnyAsync(x => x.SessionId == request.SessionId && x.MemberId == request.MemberId && x.Kind == "RESULT", ct))
            throw new ConflictException("result_exists", "A result already exists for this student and session. Edit it instead.");
        var record = existing ?? new ClassTeachingRecord { RecordId = request.RecordId, ClassId = classId, CoachId = coachId, Kind = kind!, SessionId = request.SessionId, MemberId = request.MemberId, CreatedAtUtc = clock.UtcNow };
        record.Title = title; record.Content = content; record.Score = request.Score; record.DueAtUtc = request.DueAtUtc;
        record.UpdatedAtUtc = clock.UtcNow; record.Version++;
        if (existing == null) db.Set<ClassTeachingRecord>().Add(record);
        if (existing == null && kind is "NOTICE" or "HOMEWORK") {
            var recipients = await db.Set<Enrollment>().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed && (request.MemberId == null || x.MemberId == request.MemberId)).Select(x => x.MemberId).Distinct().ToListAsync(ct);
            foreach (var recipient in recipients)
                notifications.Queue(new NotificationRequest(recipient, NotificationEvents.ClassTeachingUpdated, $"{cls.Name} · {title}\n{content}", record.RecordId));
        }
        audit.Write(new AuditEntry(coachId, update ? "EDIT_CLASS_TEACHING" : "CREATE_CLASS_TEACHING", nameof(ClassTeachingRecord), record.RecordId.ToString(), NewValue: JsonSerializer.Serialize(new { classId, kind, request.SessionId, request.MemberId })));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return record;
    }
}
