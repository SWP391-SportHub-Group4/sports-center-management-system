using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services.Flow6;

/// <summary>Coach-only evidence gateway. No user ID, SQL, table, or scope supplied by Gemini.</summary>
internal static class CoachFlow6Evidence
{
    internal static Task<object> LoadAsync(ISportHubDbContext db, Guid coachId, string topic,
        string question, DateTime now, CancellationToken ct) => topic switch
    {
        "overview" => CoachDataHub.LoadEvidenceAsync(db, coachId, CoachEvidenceDomain.Overview, now, ct),
        "notifications" => CoachDataHub.LoadEvidenceAsync(db, coachId, CoachEvidenceDomain.Notifications, now, ct),
        "requests" => CoachDataHub.LoadEvidenceAsync(db, coachId, CoachEvidenceDomain.Requests, now, ct),
        "classes" => CoachDataHub.LoadEvidenceAsync(db, coachId, CoachEvidenceDomain.Classes, now, ct),
        "students" => CoachDataHub.LoadEvidenceAsync(db, coachId, CoachEvidenceDomain.Students, now, ct),
        "account" => AccountAsync(db, coachId, ct),
        "schedule" => ScheduleAsync(db, coachId, now, ct),
        "attendance" => AttendanceAsync(db, coachId, now, ct),
        "plans" => TeachingAsync(db, coachId, "PLAN", now, ct),
        "progress" => TeachingAsync(db, coachId, "RESULT", now, ct),
        "absenceRequests" => AbsenceAsync(db, coachId, ct),
        "studentMetrics" => MetricsAsync(db, coachId, question, ct),
        _ => throw new InvalidOperationException("Unknown Coach evidence topic.")
    };

    private static string Local(DateTime utc) => VietnamTime.ToLocal(utc).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
    private static string Phase(DateTime start, DateTime end, ClassSessionStatus status, DateTime now) =>
        status == ClassSessionStatus.Cancelled ? "Cancelled" : end <= now ? "Past" : start <= now ? "InProgress" : "Future";

    private static async Task<object> AccountAsync(ISportHubDbContext db, Guid id, CancellationToken ct)
    {
        var own = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == id)
            .Select(u => new { fullName = u.Profile != null ? u.Profile.FullName : null, u.Email, phone = u.Profile != null ? u.Profile.Phone : null }).SingleOrDefaultAsync(ct);
        var coach = await db.Set<CoachProfile>().AsNoTracking().Where(p => p.UserId == id)
            .Select(p => new { p.Title, p.Bio, p.YearsExperience, p.StudentCount, p.Philosophy }).SingleOrDefaultAsync(ct);
        return new { own, coach, note = "StudentCount on the Coach profile is a manually entered career figure, not the count of current students." };
    }

    private static async Task<object> ScheduleAsync(ISportHubDbContext db, Guid id, DateTime now, CancellationToken ct)
    {
        var start = now.AddDays(-30);
        var end = now.AddDays(90);
        var q = db.Set<ClassSession>().AsNoTracking().Where(s => s.CoachId == id && s.StartAtUtc >= start && s.StartAtUtc < end);
        var total = await q.CountAsync(ct);
        var upcoming = await q.CountAsync(s => s.StartAtUtc >= now && s.Status == ClassSessionStatus.Scheduled, ct);
        var projection = q.Select(s => new { className = s.Class != null ? s.Class.Name : null,
            classCode = s.Class != null ? s.Class.Code : null, s.SessionNo, s.StartAtUtc, s.EndAtUtc, s.Status,
            room = s.Room != null ? s.Room.Name : null });
        var past = await projection.Where(s => s.StartAtUtc < now).OrderByDescending(s => s.StartAtUtc).Take(61).ToListAsync(ct);
        var future = await projection.Where(s => s.StartAtUtc >= now).OrderBy(s => s.StartAtUtc).Take(61).ToListAsync(ct);
        var sessions = past.Take(60).Concat(future.Take(60)).OrderBy(s => s.StartAtUtc).Select(s => new
        {
            s.className, s.classCode, s.SessionNo, s.room, status = s.Status.ToString(),
            startsAtVietnam = Local(s.StartAtUtc), endsAtVietnam = Local(s.EndAtUtc),
            temporalPhase = Phase(s.StartAtUtc, s.EndAtUtc, s.Status, now)
        });
        return new { totalInWindow = total, upcomingScheduledInWindow = upcoming, sessions,
            pastTruncated = past.Count > 60, futureTruncated = future.Count > 60,
            fromVietnam = Local(start), toVietnam = Local(end), note = "Own session assignments (including substitute sessions); counts limited to the stated time window." };
    }

    private static async Task<object> AttendanceAsync(ISportHubDbContext db, Guid id, DateTime now, CancellationToken ct)
    {
        // Conservative intersection: current directly assigned class, confirmed active enrollment,
        // and session actually assigned to this Coach. Never expand access from a name in the question.
        var active = CoachDataScope.Enrollments(db, id);
        var start = now.AddDays(-30);
        var end = now.AddDays(90);
        var query = from e in active
            join s in db.Set<ClassSession>().AsNoTracking().Where(s => s.CoachId == id && s.StartAtUtc >= start && s.StartAtUtc < end)
                on e.ClassId equals s.ClassId
            join u in db.Set<UserAccount>().AsNoTracking() on e.MemberId equals u.UserId
            join a in db.Set<Attendance>().AsNoTracking() on new { e.EnrollmentId, s.SessionId } equals new { a.EnrollmentId, a.SessionId } into marks
            from a in marks.DefaultIfEmpty()
            select new
            {
                className = s.Class != null ? s.Class.Name : null,
                classCode = s.Class != null ? s.Class.Code : null,
                studentName = u.Profile != null ? u.Profile.FullName : null,
                s.SessionNo, s.StartAtUtc, s.EndAtUtc, sessionStatus = s.Status,
                mark = a == null ? (AttendanceStatus?)null : a.Status
            };
        var total = await query.CountAsync(ct);
        var present = await query.CountAsync(x => x.mark == AttendanceStatus.Present, ct);
        var absent = await query.CountAsync(x => x.mark == AttendanceStatus.Absent, ct);
        var past = await query.Where(s => s.StartAtUtc < now).OrderByDescending(s => s.StartAtUtc).ThenBy(s => s.studentName).Take(101).ToListAsync(ct);
        var future = await query.Where(s => s.StartAtUtc >= now).OrderBy(s => s.StartAtUtc).ThenBy(s => s.studentName).Take(101).ToListAsync(ct);
        var records = past.Take(100).Concat(future.Take(100)).Select(x => new
        {
            x.className, x.classCode, x.studentName, x.SessionNo,
            startsAtVietnam = Local(x.StartAtUtc), endsAtVietnam = Local(x.EndAtUtc),
            sessionStatus = x.sessionStatus.ToString(), temporalPhase = Phase(x.StartAtUtc, x.EndAtUtc, x.sessionStatus, now),
            attendanceStatus = x.mark?.ToString() ?? "Unrecorded"
        });
        return new { totalStudentSessionPairs = total, recordedPresent = present, recordedAbsent = absent,
            unrecordedPairs = total - present - absent, records, pastTruncated = past.Count > 100,
            futureTruncated = future.Count > 100, fromVietnam = Local(start), toVietnam = Local(end),
            note = "Only current confirmed students in own directly assigned classes, in own sessions. Pairs are not unique students. Unrecorded is not absent; future/cancelled pairs are not predicted attendance." };
    }

    private static async Task<object> TeachingAsync(ISportHubDbContext db, Guid id, string kind, DateTime now, CancellationToken ct)
    {
        var classes = CoachDataScope.Classes(db, id);
        var active = CoachDataScope.Enrollments(db, id);
        // Less permissive than the teaching UI: only records authored by this Coach.
        var q = db.Set<ClassTeachingRecord>().AsNoTracking().Where(r => r.CoachId == id &&
            classes.Any(c => c.ClassId == r.ClassId) &&
            (r.MemberId == null || active.Any(e => e.ClassId == r.ClassId && e.MemberId == r.MemberId)) &&
            (kind == "PLAN" ? r.Kind == "PLAN" : (r.Kind == "RESULT" || r.Kind == "HOMEWORK") && r.CreatedAtUtc <= now));
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(r => r.UpdatedAtUtc).Take(40)
            .Select(r => new { className = classes.Where(c => c.ClassId == r.ClassId).Select(c => c.Name).FirstOrDefault(),
                studentName = db.Set<UserAccount>().Where(u => u.UserId == r.MemberId).Select(u => u.Profile != null ? u.Profile.FullName : null).FirstOrDefault(),
                sessionNo = db.Set<ClassSession>().Where(s => s.SessionId == r.SessionId).Select(s => (int?)s.SessionNo).FirstOrDefault(),
                r.Kind, r.Title, r.Content, r.Score, r.UpdatedAtUtc, r.DueAtUtc }).ToListAsync(ct);
        return new { total, records = rows.Select(r => new { r.className, r.studentName, r.sessionNo, r.Kind, r.Title,
            content = r.Content.Length <= 1500 ? r.Content : r.Content[..1500], contentTruncated = r.Content.Length > 1500,
            r.Score, updatedAtVietnam = Local(r.UpdatedAtUtc), dueAtVietnam = r.DueAtUtc.HasValue ? Local(r.DueAtUtc.Value) : null }),
            truncated = total > rows.Count, note = "Own authored teaching records only. Current assigned classes and active confirmed students only; not a complete history of records by other Coaches. Assessment scores are recorded results, not predicted abilities." };
    }

    private static async Task<object> AbsenceAsync(ISportHubDbContext db, Guid id, CancellationToken ct)
    {
        var q = db.Set<ClassSessionChangeRequest>().AsNoTracking().Where(r => r.RequestedByUserId == id);
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(r => r.CreatedAtUtc).Take(40)
            .Select(r => new { className = r.Session.Class != null ? r.Session.Class.Name : null,
                r.Session.SessionNo, r.Type, r.Status, r.Reason, r.OriginalStartAtUtc, r.OriginalEndAtUtc,
                r.CreatedAtUtc, r.ReviewedAtUtc }).ToListAsync(ct);
        return new { total, requests = rows.Select(r => new { r.className, r.SessionNo, r.Type, r.Status, r.Reason,
            startsAtVietnam = Local(r.OriginalStartAtUtc), endsAtVietnam = Local(r.OriginalEndAtUtc),
            createdAtVietnam = Local(r.CreatedAtUtc), reviewedAtVietnam = r.ReviewedAtUtc.HasValue ? Local(r.ReviewedAtUtc.Value) : null }),
            truncated = total > rows.Count, note = "Only change/absence requests submitted by this Coach; no reviewer identity or other Coach records." };
    }

    private static string Normalize(string text)
    {
        var b = new StringBuilder();
        foreach (var c in text.Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return Regex.Replace(b.ToString(), "[^a-z0-9]+", " ").Trim();
    }

    private static async Task<object> MetricsAsync(ISportHubDbContext db, Guid id, string question, CancellationToken ct)
    {
        // Retain existing backend numeric calculator, but do not let ambiguous or unknown targets
        // turn an individual lookup into a broad health-data listing.
        if (!CoachStudentMetricAnalysis.IsMetricQuestion(question))
            return new { available = false, note = "Specify the requested measurement and authorized student or class. No clinical profile data is exposed." };
        var q = " " + Normalize(question) + " ";
        bool Mentions(string? value) => !string.IsNullOrWhiteSpace(value) &&
            q.Contains(" " + Normalize(value) + " ", StringComparison.Ordinal);
        var active = CoachDataScope.Enrollments(db, id);
        var names = await db.Set<UserAccount>().AsNoTracking().Where(u => active.Any(e => e.MemberId == u.UserId))
            .Select(u => u.Profile != null ? u.Profile.FullName : null).ToListAsync(ct);
        var classes = await CoachDataScope.Classes(db, id).Select(c => new { c.Code, c.Name }).ToListAsync(ct);
        var exactStudent = names.Count(Mentions) == 1;
        var exactClass = classes.Count(c => Mentions(c.Name) || Mentions(c.Code)) == 1;
        var aggregate = new[] { "average", "mean", "highest", "lowest", "tallest", "heaviest", "trung binh", "cao nhat", "thap nhat", "nang nhat", "nhe nhat" }.Any(Mentions);
        var wholeScope = new[] { "my students", "my assigned students", "my classes", "hoc vien cua toi", "hoc vien toi phu trach", "cac lop cua toi", "hoc vien duoc phan cong" }.Any(Mentions);
        if (!exactStudent && !(aggregate && (exactClass || wholeScope)))
            return new { available = false, note = "An authorized target was not uniquely specified. Ask for the exact assigned student or class; no other student's measurements are provided." };
        return new { backendComputedAnswer = await CoachStudentMetricAnalysis.AnswerAsync(db, id, question, ct),
            note = "Use computed result only. Do not infer a clinical diagnosis or ability from measurements." };
    }
}
