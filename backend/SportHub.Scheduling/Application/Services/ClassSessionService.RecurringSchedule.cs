using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Services;

public sealed partial class ClassSessionService
{
    public async Task<ClassScheduleChangePreview> ChangeScheduleAsync(int classId, ChangeClassScheduleRequest request,
        Guid actorUserId, bool previewOnly, CancellationToken ct = default)
    {
        const string reason = "Class weekly timetable updated by manager.";

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var cls = await db.Set<Class>().Include(c => c.ScheduleRules).SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
            throw new ConflictException("class_not_editable", "Only published or in-progress classes can change their recurring schedule.");
        if (await db.Set<Enrollment>().AnyAsync(e => e.ClassId == classId
            && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null, ct))
            throw new ConflictException("class_has_enrolled_students", "The weekly schedule can only be changed before students enroll.");
        if (cls.Version != request.ExpectedVersion)
            throw new ConflictException("class_schedule_changed", "The class has changed. Refresh class details and try again.");

        var now = clock.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT session_id FROM class_sessions WHERE class_id = {classId} ORDER BY session_id FOR UPDATE", ct);
        var remaining = await db.Set<ClassSession>()
            .Where(s => s.ClassId == classId && s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > now)
            .OrderBy(s => s.StartAtUtc).ThenBy(s => s.SessionId).ToListAsync(ct);
        if (remaining.Count == 0)
            throw new ConflictException("no_remaining_sessions", "There are no future scheduled sessions to change.");
        var ids = remaining.Select(s => s.SessionId).ToArray();
        if (await db.Set<Attendance>().AnyAsync(a => ids.Contains(a.SessionId), ct)
            || await db.Set<ClassTeachingRecord>().AnyAsync(r => r.SessionId.HasValue && ids.Contains(r.SessionId.Value), ct))
            throw new ConflictException("session_has_teaching_records", "A remaining session already has attendance or teaching records. Review it individually.");
        var rules = request.ScheduleRules.Select(r =>
        {
            if (!TimeOnly.TryParseExact(r.StartTimeLocal, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var time))
                throw new BadRequestException("invalid_schedule_time", "Enter a valid session start time.");
            return (r.DayOfWeek, StartTimeLocal: time);
        }).ToList();
        var minutes = cls.SessionMinutes ?? (int)(remaining[0].EndAtUtc - remaining[0].StartAtUtc).TotalMinutes;
        if (request.FirstSessionDate.HasValue && request.FirstSessionDate.Value < VietnamTime.TodayLocal(clock))
            throw new BadRequestException("invalid_schedule_date", "Choose a start date today or later.");
        if (request.FirstSessionDate.HasValue && !rules.Any(r => r.DayOfWeek == (int)request.FirstSessionDate.Value.DayOfWeek))
            throw new BadRequestException("schedule_weekday_mismatch", "Choose a date matching a selected weekday.");
        var notBefore = request.FirstSessionDate.HasValue
            ? VietnamTime.StartOfDayUtc(request.FirstSessionDate.Value) : remaining[0].StartAtUtc;
        var generated = CourseRules.GenerateRemainingSessions(notBefore, remaining.Count, rules, minutes);
        var proposed = generated.Select((g, i) => new ClassScheduleChangeSlot(remaining[i].SessionId,
            remaining[i].SessionNo, remaining[i].StartAtUtc, g.StartAtUtc,
            g.StartAtUtc + (remaining[i].EndAtUtc - remaining[i].StartAtUtc))).ToList();
        if (proposed.Any(s => s.StartAtUtc <= now)
            || proposed.Any(s => proposed.Any(other => other.SessionId != s.SessionId
                && other.StartAtUtc < s.EndAtUtc && other.EndAtUtc > s.StartAtUtc)))
            throw new BadRequestException("invalid_class_schedule", "Choose future session times without overlapping sessions.");

        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            cls.Version, request.FirstSessionDate, rules = request.ScheduleRules,
            sessions = remaining.Select(s => new { s.SessionId, s.StartAtUtc, s.EndAtUtc, s.CoachId, s.RoomId })
        }))));
        if (!previewOnly && request.PreviewToken != token)
            throw new ConflictException("class_schedule_changed", "The remaining sessions have changed. Check the new schedule again before saving.");

        // Exclude the moving batch while checking unchanged sessions.
        foreach (var target in proposed)
        {
            var session = remaining.Single(s => s.SessionId == target.SessionId);
            if (await db.Set<ClassSession>().AnyAsync(s => s.ClassId == classId && !ids.Contains(s.SessionId)
                && s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc < target.EndAtUtc && s.EndAtUtc > target.StartAtUtc, ct))
                throw new ConflictException("class_session_overlap", "The new timetable overlaps a session that is already underway or completed.");
            await ValidateTargetAsync(cls, session.RoomId, session.CoachId, target.StartAtUtc, target.EndAtUtc, ct);
        }
        var previousFirst = await db.Set<ClassSession>().Where(s => s.ClassId == classId && s.Status != ClassSessionStatus.Cancelled)
            .MinAsync(s => s.StartAtUtc, ct);
        var unchangedFirst = await db.Set<ClassSession>().Where(s => s.ClassId == classId
            && s.Status != ClassSessionStatus.Cancelled && !ids.Contains(s.SessionId))
            .MinAsync(s => (DateTime?)s.StartAtUtc, ct);
        var nextFirst = unchangedFirst.HasValue && unchangedFirst < proposed[0].StartAtUtc
            ? unchangedFirst.Value : proposed[0].StartAtUtc;
        UpdateOpeningWindow(cls, previousFirst, nextFirst);

        // Release all old slots first so moving within the class's former timetable cannot conflict with itself.
        // Preview uses the same database constraints, then rolls the transaction back without sending notices.
        foreach (var session in remaining)
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, session.SessionId, ct);
        foreach (var target in proposed)
        {
            var session = remaining.Single(s => s.SessionId == target.SessionId);
            var result = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.ClassSession,
                session.SessionId, session.RoomId, session.CoachId, target.StartAtUtc, target.EndAtUtc), ct);
            if (!result.Succeeded) throw new OccupancyConflictException(result.Conflicts);
        }
        var response = new ClassScheduleChangePreview(request.ExpectedVersion, token, proposed);
        if (previewOnly)
        {
            await tx.RollbackAsync(ct);
            return response;
        }

        var movedIds = proposed.Where(target => {
            var session = remaining.Single(s => s.SessionId == target.SessionId);
            return session.StartAtUtc != target.StartAtUtc || session.EndAtUtc != target.EndAtUtc;
        }).Select(target => target.SessionId).ToArray();
        var closedRequests = await db.Set<ClassSessionChangeRequest>()
            .Where(r => movedIds.Contains(r.SessionId) && r.Status == "PENDING")
            .Select(r => r.RequestId).ToArrayAsync(ct);
        var requesters = await db.Set<ClassSessionChangeRequest>()
            .Where(r => closedRequests.Contains(r.RequestId)).Select(r => r.RequestedByUserId).ToArrayAsync(ct);
        var previousSchedule = JsonSerializer.Serialize(new {
            name = cls.Name, code = cls.Code,
            sessionMinutes = minutes, remainingSessionCount = remaining.Count,
            scheduleRules = cls.ScheduleRules.OrderBy(r => r.DayOfWeek).ThenBy(r => r.StartTimeLocal)
                .Select(r => new { dayOfWeek = r.DayOfWeek, startTimeLocal = r.StartTimeLocal.ToString("HH:mm") }),
            sessions = remaining.Select(s => new { s.SessionId, s.SessionNo, s.StartAtUtc, s.EndAtUtc, s.RoomId, s.CoachId }).ToArray(),
            changeRequests = closedRequests.Select(id => new { requestId = id, status = "PENDING" })
        });

        foreach (var target in proposed)
        {
            var session = remaining.Single(s => s.SessionId == target.SessionId);
            if (session.StartAtUtc == target.StartAtUtc && session.EndAtUtc == target.EndAtUtc) continue;
            var previousEnd = session.EndAtUtc;
            session.StartAtUtc = target.StartAtUtc;
            session.EndAtUtc = target.EndAtUtc;
            await RecordFenceStepAsync(SportHub.Scheduling.Rental.Domain.IncidentFenceStepKind.Reschedule,
                session, target.PreviousStartAtUtc, previousEnd, session.RoomId, session.CoachId,
                null, target.StartAtUtc, session.RoomId, session.CoachId, actorUserId, ct);
            var message = $"Session {session.SessionNo} · {cls.Name}: {Local(target.PreviousStartAtUtc)} → {Local(target.StartAtUtc)}.";
            await scheduleEffects.ApplyAsync(cls, session, actorUserId, session.CoachId, session.SessionId,
                session.CoachId, message, ct, "RESCHEDULE", reason, writeRequestAudit: false, notifyRecipients: false);
        }
        db.Set<ClassScheduleRule>().RemoveRange(cls.ScheduleRules);
        db.Set<ClassScheduleRule>().AddRange(rules.Select(r => new ClassScheduleRule
            { ClassId = classId, DayOfWeek = r.DayOfWeek, StartTimeLocal = r.StartTimeLocal }));
        cls.Version++;
        audit.Write(new AuditEntry(actorUserId, "CHANGE_CLASS_SCHEDULE", nameof(Class), classId.ToString(),
            OldValue: previousSchedule,
            NewValue: JsonSerializer.Serialize(new {
                name = cls.Name, code = cls.Code,
                sessionMinutes = minutes, remainingSessionCount = remaining.Count, movedSessionCount = movedIds.Length,
                scheduleRules = rules.OrderBy(r => r.DayOfWeek).ThenBy(r => r.StartTimeLocal)
                    .Select(r => new { dayOfWeek = r.DayOfWeek, startTimeLocal = r.StartTimeLocal.ToString("HH:mm") }),
                sessions = remaining.Select(s => new { s.SessionId, s.SessionNo, s.StartAtUtc, s.EndAtUtc, s.RoomId, s.CoachId }).ToArray(),
                changeRequests = closedRequests.Select(id => new { requestId = id, status = "WITHDRAWN" })
            })));
        await NotifyClassScheduleChangedAsync(cls, remaining, rules, minutes, requesters, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return response;
    }

    private async Task NotifyClassScheduleChangedAsync(Class cls, IReadOnlyList<ClassSession> sessions,
        IReadOnlyList<(int DayOfWeek, TimeOnly StartTimeLocal)> rules, int minutes,
        IEnumerable<Guid> requesters, CancellationToken ct)
    {
        var roomIds = sessions.Select(s => s.RoomId).Distinct().ToArray();
        var roomNames = await db.Set<Room>()
            .Where(r => roomIds.Contains(r.RoomId)).OrderBy(r => r.Name).Select(r => r.Name).ToArrayAsync(ct);
        var coachIds = sessions.Select(s => s.CoachId)
            .Concat(cls.CoachId.HasValue ? new[] { cls.CoachId.Value } : Array.Empty<Guid>()).Distinct().ToArray();
        var coachNames = new List<string>();
        foreach (var coachId in coachIds)
            coachNames.Add((await users.GetAsync(coachId, ct))?.FullName ?? coachId.ToString());

        // Include every selected weekday, even if the remaining sessions end before that weekday occurs.
        // Preserve the actual duration of any individually edited session in the summary.
        var timetable = rules.OrderBy(r => (r.DayOfWeek + 6) % 7).ThenBy(r => r.StartTimeLocal).Select(r =>
        {
            var ranges = sessions.Where(s => {
                var local = VietnamTime.ToLocal(s.StartAtUtc);
                return (int)local.DayOfWeek == r.DayOfWeek && TimeOnly.FromDateTime(local) == r.StartTimeLocal;
            }).Select(s => $"{VietnamTime.ToLocal(s.StartAtUtc):HH:mm}–{VietnamTime.ToLocal(s.EndAtUtc):HH:mm}")
                .Distinct().ToArray();
            var times = ranges.Length > 0 ? string.Join(" / ", ranges)
                : $"{r.StartTimeLocal:HH:mm}–{r.StartTimeLocal.AddMinutes(minutes):HH:mm}";
            return $"{CultureInfo.InvariantCulture.DateTimeFormat.GetDayName((DayOfWeek)r.DayOfWeek)}: {times}";
        });
        var title = $"Class schedule updated: {cls.Name}";
        var fields = new (string Label, string Value)[] {
            ("New schedule", string.Join("\n", timetable)),
            ("Effective from", VietnamTime.ToLocal(sessions.Min(s => s.StartAtUtc)).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)),
            ("Room", string.Join(", ", roomNames)),
            ("Coach", string.Join(", ", coachNames.Distinct()))
        };
        var note = $"The new schedule applies to the remaining {sessions.Count} {(sessions.Count == 1 ? "session" : "sessions")}. Completed sessions remain unchanged.";
        var message = title + "\n\n" + string.Join("\n", fields.Select(f => $"{f.Label}: {f.Value}")) + "\n\n" + note;
        var emailBody = EmailContent.Paragraph(title) + EmailContent.Details(fields) + EmailContent.Paragraph(note);
        var eventId = Guid.NewGuid();
        foreach (var recipientId in coachIds.Concat(requesters).Distinct())
        {
            notifications.Queue(new(recipientId, NotificationEvents.ScheduleChanged, message, eventId));
            var recipient = await users.GetAsync(recipientId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new(recipientId, recipient.Email, NotificationEvents.ScheduleChanged,
                    eventId, "SportHub · Class schedule updated", emailBody));
        }
    }
}
