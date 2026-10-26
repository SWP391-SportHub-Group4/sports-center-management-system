using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Net;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Application.Services;

public sealed record TeachingWriteRequest(Guid RecordId, string Kind, string Title, string Content,
    Guid? SessionId = null, Guid? MemberId = null, int? Score = null, DateTime? DueAtUtc = null, int Version = 0);
public sealed record TeachingMember(Guid MemberId, string MemberName, string Email, string? Goal,
    string? ExperienceLevel, string? Notes, int Present, int Absent);

public sealed class ClassTeachingService(ISportHubDbContext db, IUserAccessReader users,
    INotificationWriter notifications, IAuditWriter audit, IClock clock)
{
    private async Task RequireCoachAsync(Guid coachId, CancellationToken ct)
    {
        var actor = await users.GetAsync(coachId, ct);
        if (actor is not { IsActive: true, Role: "Coach" })
            throw new ForbiddenException("coach_required", "Coach account is not active.");
    }

    private IQueryable<Class> CurrentClasses(Guid coachId) => CoachDataScope.Classes(db, coachId);

    public async Task<object> StudentsAsync(Guid coachId, int page, string? search, int? sportId, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        if (page < 1 || page > 10000 || search?.Length > 150)
            throw new BadRequestException("invalid_student_query", "Invalid student search or page.");
        var classes = CurrentClasses(coachId);
        var enrollments = db.Set<Enrollment>().AsNoTracking().Where(e => e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
            && classes.Any(c => c.ClassId == e.ClassId) && (!sportId.HasValue || e.Class!.SportId == sportId));
        var query = db.Set<UserAccount>().AsNoTracking().Where(u => enrollments.Any(e => e.MemberId == u.UserId));
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(u => u.Email.ToLower().Contains(term) || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term)));
        }
        var totalCount = await query.CountAsync(ct);
        const int pageSize = 10;
        var items = await query.OrderBy(u => u.Profile != null ? u.Profile.FullName : u.Email).ThenBy(u => u.UserId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new { MemberId = u.UserId, MemberName = u.Profile != null ? u.Profile.FullName : u.Email, Email = u.Email }).ToListAsync(ct);
        var ids = items.Select(u => u.MemberId).ToList();
        var contexts = await enrollments.Where(e => ids.Contains(e.MemberId))
            .Select(e => new { e.MemberId, e.ClassId, ClassName = e.Class!.Name, e.Class.SportId, SportName = e.Class.Sport!.Name }).Distinct().ToListAsync(ct);
        var sports = await classes.Select(c => new { c.SportId, SportName = c.Sport!.Name }).Distinct().OrderBy(s => s.SportName).ToListAsync(ct);
        return new { Items = items.Select(u => new { u.MemberId, u.MemberName, u.Email, Classes = contexts.Where(c => c.MemberId == u.MemberId) }),
            Sports = sports, TotalCount = totalCount, Page = page, PageSize = pageSize };
    }

    public async Task<object> StudentContextAsync(Guid coachId, Guid memberId, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var classes = CurrentClasses(coachId);
        var contexts = await db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
            && classes.Any(c => c.ClassId == e.ClassId))
            .Select(e => new { e.ClassId, ClassName = e.Class!.Name, e.Class.SportId, SportName = e.Class.Sport!.Name }).Distinct().OrderBy(c => c.ClassName).ToListAsync(ct);
        if (contexts.Count == 0) throw new ForbiddenException("student_not_assigned", "You are not currently assigned to this student.");
        var student = await users.GetAsync(memberId, ct) ?? throw new NotFoundException("student_not_found", "Student not found.");
        return new { MemberId = memberId, MemberName = student.FullName, student.Email, Classes = contexts };
    }

    private async Task<IQueryable<Class>> StudentHistoryClassesQueryAsync(Guid coachId, Guid memberId, int classId, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var current = await CurrentClasses(coachId).SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new ForbiddenException("class_not_assigned", "You are not currently assigned to this class.");
        if (!await db.Set<Enrollment>().AnyAsync(e => e.ClassId == classId && e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        var previousClasses = db.Set<Enrollment>().Where(e => e.MemberId == memberId && e.ClassId != classId
            && e.Class!.SportId == current.SportId && e.Class.StartDate <= current.StartDate).Select(e => e.ClassId);
        return db.Set<Class>().AsNoTracking().Where(c => previousClasses.Contains(c.ClassId));
    }

    private async Task<IQueryable<ClassTeachingRecord>> StudentHistoryRecordsAsync(Guid coachId, Guid memberId, int classId, CancellationToken ct)
    {
        var classes = await StudentHistoryClassesQueryAsync(coachId, memberId, classId, ct);
        return db.Set<ClassTeachingRecord>().AsNoTracking().Where(r => r.MemberId == memberId && r.Kind == "RESULT"
            && classes.Any(c => c.ClassId == r.ClassId) && r.CreatedAtUtc <= clock.UtcNow);
    }

    public async Task<object> StudentHistoryClassesAsync(Guid coachId, Guid memberId, int classId, int page, string? search, CancellationToken ct)
    {
        var classes = await StudentHistoryClassesQueryAsync(coachId, memberId, classId, ct);
        if (page < 1 || page > 10000 || search?.Length > 150)
            throw new BadRequestException("invalid_history_query", "Invalid class search or page.");
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim().ToLowerInvariant();
            classes = classes.Where(c => c.Name.ToLower().Contains(term));
        }
        var records = db.Set<ClassTeachingRecord>().AsNoTracking()
            .Where(r => r.MemberId == memberId && r.Kind == "RESULT" && r.CreatedAtUtc <= clock.UtcNow);
        var sessions = db.Set<ClassSession>().AsNoTracking().Where(s => s.Status != ClassSessionStatus.Cancelled);
        var attendance = db.Set<Attendance>().AsNoTracking()
            .Where(a => a.Enrollment!.MemberId == memberId && a.Session!.Status != ClassSessionStatus.Cancelled);
        var query = classes.Select(c => new {
            c.ClassId, ClassName = c.Name, c.StartDate, c.Status, c.NumSessions, c.CreatedAt,
            AssessmentCount = records.Count(r => r.ClassId == c.ClassId),
            AverageScore = records.Where(r => r.ClassId == c.ClassId).Average(r => (double?)r.Score),
            LastRecordedAtUtc = records.Where(r => r.ClassId == c.ClassId).Max(r => (DateTime?)r.CreatedAtUtc),
            TotalSessions = sessions.Count(s => s.ClassId == c.ClassId),
            CompletedSessions = sessions.Count(s => s.ClassId == c.ClassId && s.Status == ClassSessionStatus.Completed),
            PresentSessions = attendance.Count(a => a.Session!.ClassId == c.ClassId && a.Status == AttendanceStatus.Present),
            AbsentSessions = attendance.Count(a => a.Session!.ClassId == c.ClassId && a.Status == AttendanceStatus.Absent)
        });
        var totalCount = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(c => c.LastRecordedAtUtc ?? c.CreatedAt).ThenBy(c => c.ClassId)
            .Skip((page - 1) * 8).Take(8).ToListAsync(ct);
        var items = rows.Select(c => new {
            c.ClassId, c.ClassName, c.StartDate, c.AssessmentCount, c.AverageScore, c.LastRecordedAtUtc,
            Status = c.Status == ClassStatus.InProgress ? "IN_PROGRESS" : c.Status.ToString().ToUpperInvariant(),
            TotalSessions = c.TotalSessions > 0 ? c.TotalSessions : c.NumSessions,
            c.CompletedSessions, c.PresentSessions, c.AbsentSessions
        });
        return new { Items = items, TotalCount = totalCount, Page = page, PageSize = 8 };
    }

    public async Task<object> StudentHistoryAsync(Guid coachId, Guid memberId, int classId, int page, CancellationToken ct, int? sourceClassId = null)
    {
        var records = await StudentHistoryRecordsAsync(coachId, memberId, classId, ct);
        if (page < 1 || page > 10000) throw new BadRequestException("invalid_page", "Invalid page.");
        if (sourceClassId.HasValue) records = records.Where(r => r.ClassId == sourceClassId);
        var totalCount = await records.CountAsync(ct);
        var items = await (from r in records
            join c in db.Set<Class>() on r.ClassId equals c.ClassId
            join s in db.Set<ClassSession>() on r.SessionId equals (Guid?)s.SessionId into sessions
            from s in sessions.DefaultIfEmpty()
            orderby r.CreatedAtUtc descending, r.RecordId
            select new { Record = r, ClassName = c.Name, SportName = c.Sport!.Name, SessionNo = s == null ? (int?)null : s.SessionNo,
                SessionStartAtUtc = s == null ? (DateTime?)null : s.StartAtUtc })
            .Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        var names = new Dictionary<Guid, string>();
        foreach (var id in items.Select(i => i.Record.CoachId).Distinct())
            names[id] = (await users.GetAsync(id, ct))?.FullName ?? "";
        return new { Items = items.Select(i => new { i.Record, i.ClassName, i.SportName, i.SessionNo, i.SessionStartAtUtc,
            CoachName = names[i.Record.CoachId] }), TotalCount = totalCount, Page = page, PageSize = 20 };
    }

    public async Task<Class> RequireClassAsync(int classId, Guid coachId, CancellationToken ct)
    {
        var actor = await users.GetAsync(coachId, ct);
        if (actor is not { IsActive: true, Role: "Coach" })
            throw new ForbiddenException("coach_required", "Coach account is not active.");
        var cls = await db.Set<Class>().AsNoTracking().Include(x => x.Sport).SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
            throw new ForbiddenException("class_access_ended", "Access is no longer available for this class.");
        if (cls.CoachId != coachId && !await db.Set<ClassSession>().AnyAsync(x => x.ClassId == classId && x.CoachId == coachId && x.Status != ClassSessionStatus.Cancelled, ct))
            throw new ForbiddenException("class_not_assigned", "You are not assigned to this class.");
        return cls;
    }

    private async Task RequireTeachingSessionAsync(Class cls, Guid coachId, Guid? sessionId, CancellationToken ct)
    {
        var substitute = cls.CoachId != coachId;
        if (substitute && !sessionId.HasValue)
            throw new ForbiddenException("session_scope_required", "Substitute coaches must open their assigned session.");
        if (sessionId.HasValue && !await db.Set<ClassSession>().AnyAsync(s => s.SessionId == sessionId
                && s.ClassId == cls.ClassId
                && (!substitute || (s.CoachId == coachId && s.Status != ClassSessionStatus.Cancelled)), ct))
            throw new ForbiddenException("session_not_assigned", "This session is not available to you.");
    }

    public async Task<object> RecordsAsync(int classId, Guid actorId, bool member, int page, CancellationToken ct, Guid? memberId = null, Guid? sessionId = null)
    {
        Class? cls = null;
        if (member) {
            await MemberClassAccess.RequireAsync(db, actorId, classId, clock.UtcNow, ct);
        } else {
            cls = await RequireClassAsync(classId, actorId, ct);
            await RequireTeachingSessionAsync(cls, actorId, sessionId, ct);
        }
        if (!member && memberId.HasValue && !await db.Set<Enrollment>().AnyAsync(x => x.ClassId == classId && x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed && x.EndedAt == null, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        if (page < 1 || page > 10000) throw new BadRequestException("invalid_page", "Invalid page.");
        var query = db.Set<ClassTeachingRecord>().AsNoTracking().Where(x => x.ClassId == classId);
        if (!member) {
            var primary = cls!.CoachId == actorId;
            query = query.Where(r => r.MemberId == null || db.Set<Enrollment>().Any(e => e.ClassId == classId
                && e.MemberId == r.MemberId && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null));
            if (!primary) query = query.Where(r => r.SessionId != null && db.Set<ClassSession>().Any(s => s.SessionId == r.SessionId
                && s.CoachId == actorId && s.Status != ClassSessionStatus.Cancelled));
            if (sessionId.HasValue) query = query.Where(r => r.SessionId == sessionId
                || (primary && r.SessionId == null && r.Kind == "PLAN"));
        }
        if (member) query = query.Where(x => x.MemberId == null || x.MemberId == actorId);
        else if (memberId.HasValue) query = query.Where(x => x.MemberId == memberId || (x.MemberId == null && x.Kind == "PLAN"));
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.RecordId)
            .Skip((page - 1) * 100).Take(100).ToListAsync(ct);
        return new { items, page, pageSize = 100, totalCount = total };
    }

    public async Task<IReadOnlyList<TeachingMember>> MembersAsync(int classId, Guid coachId, CancellationToken ct, Guid? memberId = null, Guid? sessionId = null)
    {
        var cls = await RequireClassAsync(classId, coachId, ct);
        var substitute = cls.CoachId != coachId;
        await RequireTeachingSessionAsync(cls, coachId, sessionId, ct);
        var ids = await db.Set<Enrollment>().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed && x.EndedAt == null && (!memberId.HasValue || x.MemberId == memberId))
            .Select(x => x.MemberId).Distinct().ToListAsync(ct);
        if (memberId.HasValue && ids.Count == 0)
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        var profiles = substitute ? new Dictionary<Guid, MemberTrainingProfile>()
            : await db.Set<MemberTrainingProfile>().AsNoTracking().Where(x => ids.Contains(x.MemberId)).ToDictionaryAsync(x => x.MemberId, ct);
        var attendance = await db.Set<Attendance>().AsNoTracking().Where(x => x.Enrollment!.ClassId == classId && ids.Contains(x.Enrollment.MemberId)
            && x.Enrollment.Status == EnrollmentStatus.Confirmed && x.Enrollment.EndedAt == null
            && (!substitute || x.SessionId == sessionId))
            .Select(x => new { x.Enrollment!.MemberId, x.Status }).ToListAsync(ct);
        var members = new List<TeachingMember>();
        foreach (var id in ids) {
            var user = await users.GetAsync(id, ct);
            profiles.TryGetValue(id, out var p);
            members.Add(new(id, user?.FullName ?? "", user?.Email ?? "", substitute ? null : p?.Goal, substitute ? null : p?.ExperienceLevel.ToString(), substitute ? null : p?.Notes,
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
        if (kind is "RESULT" or "HOMEWORK") await ClassOpeningGuard.RequireAsync(db, cls, ct);
        // Homework is optional practice before the next lesson, without a fixed due date.
        if (kind == "HOMEWORK") request = request with { DueAtUtc = null };
        var title = request.Title?.Trim() ?? "";
        var content = request.Content?.Trim() ?? "";
        if (request.RecordId == Guid.Empty || kind is not ("PLAN" or "RESULT" or "NOTICE" or "HOMEWORK") || title.Length is < 1 or > 160 || content.Length is < 1 or > 8000 || request.Score is < 1 or > 5)
            throw new BadRequestException("teaching_invalid", "Enter a title, content and a valid assessment.");
        if (kind == "RESULT" && (!request.SessionId.HasValue || !request.MemberId.HasValue))
            throw new BadRequestException("result_scope_required", "Select a session and student.");
        if (kind == "HOMEWORK" && !request.SessionId.HasValue)
            throw new BadRequestException("homework_session_required", "Homework must belong to the lesson that has ended.");
        if (kind != "RESULT" && request.Score.HasValue)
            throw new BadRequestException("score_result_only", "Assessment belongs to a session result.");
        if (request.MemberId.HasValue && !await db.Set<Enrollment>().AnyAsync(x => x.ClassId == classId && x.MemberId == request.MemberId && x.Status == EnrollmentStatus.Confirmed && x.EndedAt == null, ct))
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        int? homeworkSessionNo = null;
        if (request.SessionId.HasValue) {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT session_id FROM class_sessions WHERE session_id = {request.SessionId.Value} FOR UPDATE", ct);
            var session = await db.Set<ClassSession>().AsNoTracking().SingleOrDefaultAsync(x => x.SessionId == request.SessionId && x.ClassId == classId, ct)
                ?? throw new BadRequestException("session_not_in_class", "Session does not belong to this class.");
            if (session.CoachId != coachId) throw new ForbiddenException("session_not_assigned", "You are not assigned to this session.");
            if (session.Status == ClassSessionStatus.Cancelled) throw new ConflictException("session_cancelled", "Session is cancelled.");
            if (kind == "RESULT" && clock.UtcNow < session.StartAtUtc) throw new ConflictException("result_not_open", "Results can be recorded after the session starts.");
            // Attendance writes hold this same session lock, so an Absent correction cannot
            // race the Present check and leave a result attached to an absent student.
            if (kind == "RESULT" && !await (
                from attendance in db.Set<Attendance>()
                join enrollment in db.Set<Enrollment>() on attendance.EnrollmentId equals enrollment.EnrollmentId
                where attendance.SessionId == session.SessionId && attendance.Status == AttendanceStatus.Present
                    && enrollment.ClassId == classId && enrollment.MemberId == request.MemberId
                    && enrollment.Status == EnrollmentStatus.Confirmed && enrollment.EndedAt == null
                select attendance.AttendanceId).AnyAsync(ct))
                throw new ConflictException("result_attendance_required",
                    "Mark the student Present for this session before recording or editing a result.");
            if (kind == "HOMEWORK" && clock.UtcNow < session.EndAtUtc)
                throw new ConflictException("homework_not_open", "Homework can only be assigned after the session ends.");
            if (kind == "HOMEWORK") homeworkSessionNo = session.SessionNo;
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
            var recipients = await (from enrollment in db.Set<Enrollment>()
                join account in db.Set<UserAccount>() on enrollment.MemberId equals account.UserId
                where enrollment.ClassId == classId && enrollment.Status == EnrollmentStatus.Confirmed && enrollment.EndedAt == null
                    && (request.MemberId == null || enrollment.MemberId == request.MemberId)
                select new { account.UserId, account.Email }).Distinct().ToListAsync(ct);
            var emailBody = kind == "HOMEWORK"
                ? HomeworkEmailBody(cls.Name, homeworkSessionNo!.Value, title, content)
                : null;
            foreach (var recipient in recipients) {
                notifications.Queue(new NotificationRequest(recipient.UserId, NotificationEvents.ClassTeachingUpdated, $"{cls.Name} · {title}\n{content}", record.RecordId));
                if (emailBody != null)
                    notifications.QueueEmail(new EmailNotificationRequest(recipient.UserId, recipient.Email,
                        NotificationEvents.ClassTeachingUpdated, record.RecordId,
                        "SportHub · Homework · " + title.Replace('\r', ' ').Replace('\n', ' '), emailBody));
            }
        }
        if (existing == null && kind == "RESULT" && request.MemberId is Guid assessedMemberId)
            notifications.Queue(new NotificationRequest(assessedMemberId, NotificationEvents.ClassTeachingUpdated,
                $"New assessment · {cls.Name} · {title}", record.RecordId));
        audit.Write(new AuditEntry(coachId, update ? "EDIT_CLASS_TEACHING" : "CREATE_CLASS_TEACHING", nameof(ClassTeachingRecord), record.RecordId.ToString(), NewValue: JsonSerializer.Serialize(new { classId, kind, request.SessionId, request.MemberId })));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return record;
    }

    private static string HomeworkEmailBody(string className, int sessionNo, string title, string content)
    {
        var header = "<h2>Homework</h2><p><strong>Class:</strong> "
            + WebUtility.HtmlEncode(className) + "<br><strong>Session:</strong> " + sessionNo
            + "<br>Aim to complete before the next lesson — optional."
            + "</p><h3>" + WebUtility.HtmlEncode(title) + "</h3><p>";
        const string footer = "</p><p>Open SportHub → My Schedule → your class → From your coach to view the full homework.</p>";
        static string Encode(string text) => WebUtility.HtmlEncode(text).Replace("\r\n", "\n").Replace("\n", "<br>");
        var encoded = Encode(content);
        // Keep the encrypted outbox payload within its existing 24,000-character limit.
        if (header.Length + encoded.Length + footer.Length > 24_000) {
            const string more = "<br>… (View the full homework in SportHub)";
            var budget = 24_000 - header.Length - footer.Length - more.Length;
            var low = 0;
            var high = content.Length;
            while (low < high) {
                var mid = (low + high + 1) / 2;
                if (Encode(content[..mid]).Length <= budget) low = mid;
                else high = mid - 1;
            }
            if (low > 0 && char.IsHighSurrogate(content[low - 1])) low--;
            encoded = Encode(content[..low]) + more;
        }
        return header + encoded + footer;
    }
}
