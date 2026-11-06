using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// V28: Same per-enrollment session/attendance join as the official Member schedule.
/// UTC is authoritative for comparisons; local timestamps are materialized using the
/// shared VietnamTime utility, never converted or guessed by the language model.
/// Unrecorded attendance is NOT an absence. No other member's roster is returned.
/// </summary>
internal static class MemberSessionTimelineV28
{
    internal sealed record Session(
        string ClassName, int SessionNo, string? Room,
        DateTime StartAtUtc, DateTime EndAtUtc,
        string StartsAtVietnam, string EndsAtVietnam,
        string SessionStatus, string? AttendanceStatus,
        string AttendanceMeaning, string TemporalPhase,
        DateTime? RecordedAtUtc, string? RecordedAtVietnam);

    internal sealed record Timeline(
        string TimeZone, string CurrentVietnamTime, string CurrentUtcTime,
        IReadOnlyList<Session> Sessions,
        int PresentRecords, int AbsentRecords, int UnrecordedSessions,
        bool PastTruncated, bool FutureTruncated,
        string Note);

    internal static async Task<Timeline> LoadAsync(
        ISportHubDbContext db, Guid authenticatedMemberId, DateTime nowUtc, CancellationToken ct)
    {
        var authorizedEnrollments = db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.MemberId == authenticatedMemberId && e.Status == EnrollmentStatus.Confirmed);
        var query =
            from e in authorizedEnrollments
            join s in db.Set<ClassSession>().AsNoTracking() on e.ClassId equals s.ClassId
            join a in db.Set<Attendance>().AsNoTracking()
                on new { e.EnrollmentId, s.SessionId } equals new { a.EnrollmentId, a.SessionId } into marked
            from a in marked.DefaultIfEmpty()
            select new
            {
                s.StartAtUtc, s.EndAtUtc, s.SessionNo, s.Status,
                ClassName = s.Class != null ? s.Class.Name : "Unknown class",
                Room = s.Room != null ? s.Room.Name : null,
                Attendance = a == null ? (AttendanceStatus?)null : a.Status,
                RecordedAtUtc = a == null ? (DateTime?)null : a.RecordedAt
            };

        // Query both sides independently. A long attendance history must not hide upcoming sessions.
        const int maxPerSide = 90;
        var past = await query.Where(x => x.StartAtUtc < nowUtc)
            .OrderByDescending(x => x.StartAtUtc).Take(maxPerSide + 1).ToListAsync(ct);
        var future = await query.Where(x => x.StartAtUtc >= nowUtc)
            .OrderBy(x => x.StartAtUtc).Take(maxPerSide + 1).ToListAsync(ct);
        var pastTruncated = past.Count > maxPerSide;
        var futureTruncated = future.Count > maxPerSide;
        var records = past.Take(maxPerSide).Concat(future.Take(maxPerSide))
            .OrderBy(x => x.StartAtUtc).Select(x =>
            {
                var status = x.Attendance?.ToString();
                var phase = x.Status == ClassSessionStatus.Cancelled ? "Cancelled"
                    : x.EndAtUtc <= nowUtc ? "Past"
                    : x.StartAtUtc <= nowUtc ? "InProgress" : "Future";
                var meaning = x.Attendance == AttendanceStatus.Present ? "Recorded present"
                    : x.Attendance == AttendanceStatus.Absent ? "Recorded absent"
                    : x.Status == ClassSessionStatus.Cancelled ? "No attendance; session cancelled"
                    : x.StartAtUtc > nowUtc ? "Not yet held; no attendance recorded"
                    : "No attendance record; do not infer absent";
                return new Session(x.ClassName, x.SessionNo, x.Room,
                    x.StartAtUtc, x.EndAtUtc,
                    VietnamTime.ToLocal(x.StartAtUtc).ToString("yyyy-MM-dd HH:mm"),
                    VietnamTime.ToLocal(x.EndAtUtc).ToString("yyyy-MM-dd HH:mm"),
                    x.Status.ToString(), status, meaning, phase, x.RecordedAtUtc,
                    x.RecordedAtUtc.HasValue
                        ? VietnamTime.ToLocal(x.RecordedAtUtc.Value).ToString("yyyy-MM-dd HH:mm") : null);
            }).ToList();
        return new Timeline("Asia/Ho_Chi_Minh (UTC+07:00)",
            VietnamTime.ToLocal(nowUtc).ToString("yyyy-MM-dd HH:mm"),
            nowUtc.ToString("yyyy-MM-dd HH:mm 'UTC'"), records,
            records.Count(x => x.AttendanceStatus == nameof(AttendanceStatus.Present)),
            records.Count(x => x.AttendanceStatus == nameof(AttendanceStatus.Absent)),
            records.Count(x => x.AttendanceStatus is null),
            pastTruncated, futureTruncated,
            "Attendance belongs only to the authenticated Member. Only a recorded Present or Absent is definitive. " +
            "A missing attendance record never proves absence. Use StartsAtVietnam/EndsAtVietnam for display. " +
            "CurrentVietnamTime is derived from the server clock; historical and future sessions are separate.");
    }
}
