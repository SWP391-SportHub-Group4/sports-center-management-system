using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Rules;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services.CoachPlanning;

public sealed record PlanProfile(string Goal, string Experience, string? Notes, string? Activity, int? TrainingDays,
    int? AgeYears = null, string? GoalType = null, PersonalBodyMetrics? Body = null);
public sealed record PersonalBodyMetrics(decimal HeightCm, decimal WeightKg, decimal Bmi);
public sealed record PlanSession(int SessionNo, int DurationMinutes);
public sealed record HistoricalSession(int SessionNo, int AssessmentCount, double? AverageScore);
public sealed record CoachPlanSnapshot(string Sport, int TotalSessions, PlanSession? TargetSession,
    int StudentCount, IReadOnlyList<PlanProfile> Profiles, AttendanceSummary Attendance,
    int CompletedSessions, ScoreSummary CurrentProgress, ScoreSummary? PriorProgress,
    IReadOnlyList<HistoricalSession> RecentSessions, IReadOnlyList<PlanHistoryRow> Plans,
    IReadOnlyList<SkillMention> FeedbackMentions, int FeedbackSampleCount,
    IReadOnlyList<AssessmentExcerpt> PersonalAssessments, IReadOnlyList<Guid>? AuthorizedMemberIds = null);

/// <summary>Read-only context. The controller authorizes the assigned coach first; repeat scope checks here.</summary>
public sealed class CoachPlanContextReader(ISportHubDbContext db)
{
    public async Task<CoachPlanSnapshot> ReadAsync(Class cls, Guid coachId, Guid? memberId,
        ClassSession? target, DateTime now, CancellationToken ct)
    {
        if (cls.CoachId != coachId || (target is not null && (target.ClassId != cls.ClassId || target.CoachId != coachId)))
            throw new ForbiddenException("class_plan_not_assigned", "Only the assigned coach can generate this plan.");
        var classId = cls.ClassId;
        var enrollments = db.Set<Enrollment>().AsNoTracking().Where(e => e.ClassId == classId
            && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
            && (!memberId.HasValue || e.MemberId == memberId));
        var ids = enrollments.Select(e => e.MemberId).Distinct();
        var memberIds = await ids.ToArrayAsync(ct);
        var studentCount = memberIds.Length;
        if (memberId.HasValue && studentCount != 1)
            throw new ForbiddenException("member_not_in_class", "Student is not registered in this class.");
        var personalGym = memberId.HasValue && string.Equals(cls.Sport!.Code, SportCodes.Gym, StringComparison.OrdinalIgnoreCase);
        var profileRows = await db.Set<MemberTrainingProfile>().AsNoTracking().Where(p => memberIds.Contains(p.MemberId))
            .Select(p => new { p.Goal, p.ExperienceLevel, p.Notes, p.ActivityLevel, p.TrainingDaysPerWeek, p.DateOfBirth, p.GoalType,
                Height = personalGym ? p.HeightCm : null, Weight = personalGym ? p.WeightKg : null }).ToListAsync(ct);
        var today = DateOnly.FromDateTime(VietnamTime.ToLocal(now));
        var profiles = profileRows.Select(p =>
        {
            int? age = p.DateOfBirth is { } dob && dob <= today ? BodyMetrics.AgeOn(dob, today) : null;
            if (age is < 14 or > 90) age = null;
            // Self-reported adult Gym measurements only. Never send DOB or classify a minor by adult BMI.
            PersonalBodyMetrics? body = age is >= 18 && p.Height is >= 80 and <= 240 && p.Weight is >= 15 and <= 400
                ? new(p.Height.Value, p.Weight.Value, BodyMetrics.Bmi(p.Height.Value, p.Weight.Value)) : null;
            return new PlanProfile(p.Goal, p.ExperienceLevel.ToString(), p.Notes,
                p.ActivityLevel?.ToString(), p.TrainingDaysPerWeek, age, p.GoalType?.ToString(), body);
        }).ToArray();
        // Exclude cancelled, ongoing and future sessions even if a draft/result was pre-created.
        var completed = db.Set<ClassSession>().AsNoTracking().Where(s => s.ClassId == classId
            && s.Status == ClassSessionStatus.Completed && s.EndAtUtc <= now);
        var completedCount = await completed.CountAsync(ct);
        var recent = await completed.OrderByDescending(s => s.EndAtUtc).ThenByDescending(s => s.SessionNo)
            .Take(PlanContextBudget.HistorySessions).Select(s => new { s.SessionId, s.SessionNo }).ToListAsync(ct);
        var recentIds = recent.Select(s => s.SessionId).ToArray();
        var attendance = await db.Set<Attendance>().AsNoTracking()
            .Where(a => enrollments.Any(e => e.EnrollmentId == a.EnrollmentId)
                && completed.Any(s => s.SessionId == a.SessionId) && a.RecordedAt <= now)
            .GroupBy(a => a.Status).Select(g => new { Status = g.Key, Count = g.Count() }).ToListAsync(ct);
        var attendanceSummary = new AttendanceSummary(attendance.Where(x => x.Status == AttendanceStatus.Present).Sum(x => x.Count),
            attendance.Where(x => x.Status == AttendanceStatus.Absent).Sum(x => x.Count));
        var records = db.Set<ClassTeachingRecord>().AsNoTracking().Where(r => r.ClassId == classId && r.CoachId == coachId
            && r.CreatedAtUtc <= now && r.UpdatedAtUtc <= now && r.SessionId.HasValue);
        var results = records.Where(r => r.Kind == "RESULT" && r.MemberId.HasValue && memberIds.Contains(r.MemberId.Value)
            && completed.Any(s => s.SessionId == r.SessionId)
            // Only actual assessed attendees. This also excludes results invalidated by attendance correction.
            && db.Set<Attendance>().Any(a => a.SessionId == r.SessionId && a.Status == AttendanceStatus.Present
                && a.RecordedAt <= now && enrollments.Any(e => e.EnrollmentId == a.EnrollmentId && e.MemberId == r.MemberId)));
        var scores = await (from r in results join s in completed on r.SessionId equals (Guid?)s.SessionId
            select new { SessionId = s.SessionId, s.SessionNo, r.Score, s.EndAtUtc }).ToListAsync(ct);
        var currentProgress = TrainingProgressAnalyzer.Summarize(scores.Select(s => new ScoreRecord(s.Score, s.EndAtUtc, s.SessionNo)));
        // Group-level trend based on unordered individual scores can mislead. Session-level means are provided instead.
        if (!memberId.HasValue) currentProgress = currentProgress with { Latest = null, Trend = "see_session_averages" };
        var sessionSummaries = recent.Select(s =>
        {
            var values = scores.Where(r => r.SessionId == s.SessionId && r.Score is >= 1 and <= 5).Select(r => r.Score!.Value).ToArray();
            return new HistoricalSession(s.SessionNo, scores.Count(r => r.SessionId == s.SessionId),
                values.Length == 0 ? null : Math.Round(values.Average(), 2));
        }).ToArray();
        var planRows = await (from r in records join s in completed on r.SessionId equals (Guid?)s.SessionId
            where r.Kind == "PLAN" && recentIds.Contains(s.SessionId)
                && (r.MemberId == null || (memberId.HasValue && r.MemberId == memberId))
            orderby s.EndAtUtc descending, r.UpdatedAtUtc descending, r.RecordId
            select new { s.SessionNo, r.Title, r.Content }).Take(6).ToListAsync(ct);
        var plans = planRows.Select(r => new PlanHistoryRow(r.SessionNo, r.Title, r.Content)).ToArray();
        var sample = Array.Empty<SkillMention>();
        int sampleCount = 0;
        ScoreSummary? priorProgress = null;
        var personalResults = new List<AssessmentExcerpt>();
        if (!memberId.HasValue)
        {
            // No class member's raw assessment is sent to Gemini. Vocabulary counts only.
            var feedback = await results.Where(r => recentIds.Contains(r.SessionId!.Value))
                .OrderByDescending(r => r.UpdatedAtUtc).ThenBy(r => r.RecordId)
                .Take(PlanContextBudget.ClassAssessmentSample).Select(r => r.Content).ToListAsync(ct);
            sample = LessonHistoryAggregator.Mentions(feedback);
            sampleCount = feedback.Count;
        }
        else
        {
            // More restrictive than the general Student History UI: same selected student,
            // same sport, previous classes taught by this coach, no other coach's records.
            var pastClasses = db.Set<Class>().AsNoTracking().Where(c => c.ClassId != classId && c.CoachId == coachId
                && c.SportId == cls.SportId && c.StartDate <= cls.StartDate
                && db.Set<Enrollment>().Any(e => e.ClassId == c.ClassId && e.MemberId == memberId && e.EnrolledAt <= now));
            var pastSessions = db.Set<ClassSession>().AsNoTracking().Where(s => pastClasses.Any(c => c.ClassId == s.ClassId)
                && s.Status == ClassSessionStatus.Completed && s.EndAtUtc <= now && s.CoachId == coachId);
            var pastResults = db.Set<ClassTeachingRecord>().AsNoTracking().Where(r => r.Kind == "RESULT"
                && r.CoachId == coachId && r.MemberId == memberId && r.CreatedAtUtc <= now && r.UpdatedAtUtc <= now
                && pastSessions.Any(s => s.SessionId == r.SessionId && s.ClassId == r.ClassId)
                && db.Set<Attendance>().Any(a => a.SessionId == r.SessionId && a.Status == AttendanceStatus.Present && a.RecordedAt <= now
                    && a.Enrollment!.ClassId == r.ClassId && a.Enrollment.MemberId == memberId));
            var previousScores = await (from r in pastResults join s in pastSessions on r.SessionId equals (Guid?)s.SessionId
                select new { r.Score, s.EndAtUtc, s.SessionNo }).ToListAsync(ct);
            priorProgress = TrainingProgressAnalyzer.Summarize(previousScores.Select(r => new ScoreRecord(r.Score, r.EndAtUtc, r.SessionNo)));
            var currentDetails = await (from r in results join s in completed on r.SessionId equals (Guid?)s.SessionId
                orderby s.EndAtUtc descending, r.UpdatedAtUtc descending, r.RecordId
                select new { s.SessionNo, r.Score, r.Content }).Take(PlanContextBudget.RecentPersonalResults).ToListAsync(ct);
            personalResults.AddRange(currentDetails.Select(r => new AssessmentExcerpt(r.SessionNo, r.Score,
                PlanContextBudget.Excerpt(r.Content), false)));
            // Reserve a small separately labelled previous-class comparison rather than mixing score timelines.
            var previousDetails = await (from r in pastResults join s in pastSessions on r.SessionId equals (Guid?)s.SessionId
                orderby s.EndAtUtc descending, r.UpdatedAtUtc descending, r.RecordId
                select new { s.SessionNo, r.Score, r.Content }).Take(2).ToListAsync(ct);
            personalResults.AddRange(previousDetails.Select(r => new AssessmentExcerpt(r.SessionNo, r.Score,
                PlanContextBudget.Excerpt(r.Content), true)));
        }
        var targetInfo = target is null ? null : new PlanSession(target.SessionNo, (int)Math.Ceiling((target.EndAtUtc - target.StartAtUtc).TotalMinutes));
        var totalSessions = await db.Set<ClassSession>().AsNoTracking().CountAsync(s => s.ClassId == classId && s.Status != ClassSessionStatus.Cancelled, ct);
        return new(cls.Sport!.Name, totalSessions == 0 ? cls.NumSessions : totalSessions, targetInfo,
            studentCount, profiles, attendanceSummary, completedCount, currentProgress, priorProgress,
            sessionSummaries, plans, sample, sampleCount, personalResults, memberIds);
    }
}
