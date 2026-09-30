using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Lịch buổi của khóa: xem, roster, dời một buổi, hủy một buổi kèm buổi bù. Mọi thao tác đổi lịch dùng occupancy nguyên tử
/// (lịch cũ giữ nguyên nếu lịch mới xung đột), giữ nguyên ghi danh và báo cho học viên. Đổi lịch không tự hoàn tiền: số buổi
/// thực cung cấp luôn là NumSessions nhờ buổi bù.
/// </summary>
public sealed class ClassSessionService(
    ISportHubDbContext db,
    CourseValidator validator,
    IOccupancyService occupancy,
    RoomOpeningHourService openingHours,
    IUserAccessReader users,
    INotificationWriter notifications,
    IAuditWriter audit,
    IClock clock) : IClassSessionService
{
    private static readonly TimeSpan AttendanceGrace = TimeSpan.FromHours(24);

    // ---------------------------------------------------------------- Truy vấn

    public async Task<IReadOnlyList<ClassSessionResponse>> ListByClassAsync(
        int classId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        await EnsureClassAccessAsync(classId, restrictToCoachId, ct);

        var rows = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.ClassId == classId).OrderBy(s => s.SessionNo)).ToListAsync(ct);
        return await ToResponsesAsync(rows, ct);
    }

    public async Task<ClassSessionResponse> GetAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.SessionId == sessionId)).SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        await EnsureClassAccessAsync(row.Session.ClassId, restrictToCoachId, ct);
        return (await ToResponsesAsync([row], ct))[0];
    }

    public async Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.SessionId == sessionId)).SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        await EnsureClassAccessAsync(row.Session.ClassId, restrictToCoachId, ct);

        var session = (await ToResponsesAsync([row], ct))[0];

        // Roster = ghi danh Confirmed + ghi danh đã kết thúc nhưng đã có điểm danh ở buổi này (giữ lịch sử đọc được).
        var entries = await (from e in db.Set<Enrollment>().AsNoTracking()
                             where e.ClassId == row.Session.ClassId
                             join a in db.Set<Attendance>().AsNoTracking().Where(x => x.SessionId == sessionId)
                                 on e.EnrollmentId equals a.EnrollmentId into att
                             from a in att.DefaultIfEmpty()
                             where e.Status == EnrollmentStatus.Confirmed || a != null
                             orderby e.EnrolledAt
                             select new { e.EnrollmentId, e.MemberId, e.Status, AttStatus = (AttendanceStatus?)a!.Status, AttAt = (DateTime?)a.RecordedAt })
            .ToListAsync(ct);

        var result = new List<RosterEntryResponse>();
        foreach (var e in entries)
        {
            var info = await users.GetAsync(e.MemberId, ct);
            result.Add(new RosterEntryResponse(
                e.EnrollmentId, e.MemberId, info?.FullName ?? string.Empty,
                e.Status.ToString(), e.AttStatus?.ToString(), e.AttAt));
        }

        return new SessionRosterResponse(
            session,
            row.Session.StartAtUtc,
            row.Session.EndAtUtc + AttendanceGrace,
            result);
    }

    public async Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(
        Guid memberId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        if (toUtc <= fromUtc || toUtc - fromUtc > TimeSpan.FromDays(92))
        {
            throw new BadRequestException("invalid_range", "Khoảng thời gian phải dương và tối đa 92 ngày.");
        }

        var rangeFrom = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var rangeTo = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        return await (from e in db.Set<Enrollment>().AsNoTracking()
                      where e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed
                      join s in db.Set<ClassSession>().AsNoTracking() on e.ClassId equals s.ClassId
                      where s.StartAtUtc >= rangeFrom && s.StartAtUtc < rangeTo
                      join a in db.Set<Attendance>().AsNoTracking() on new { e.EnrollmentId, s.SessionId }
                          equals new { a.EnrollmentId, a.SessionId } into att
                      from a in att.DefaultIfEmpty()
                      orderby s.StartAtUtc
                      select new MemberSessionResponse(
                          s.SessionId, s.ClassId, s.Class!.Name, s.Class.Sport!.Name, s.SessionNo, s.Room!.Name,
                          s.StartAtUtc, s.EndAtUtc, s.Status.ToString(), s.IsMakeup,
                          a == null ? null : a.Status.ToString()))
            .ToListAsync(ct);
    }

    // ---------------------------------------------------------------- Dời

    public async Task<ClassSessionResponse> RescheduleAsync(
        Guid sessionId, RescheduleSessionRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var session = await LockAndLoadAsync(sessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);

        EnsureEditable(session, cls);

        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = start + (session.EndAtUtc - session.StartAtUtc);

        if (start <= clock.UtcNow)
        {
            throw new BadRequestException("session_time_in_past", "Giờ mới phải ở tương lai.");
        }

        var roomId = request.RoomId ?? session.RoomId;
        var coachId = request.CoachId ?? session.CoachId;

        await ValidateTargetAsync(cls, roomId, coachId, start, end, ct);
        await EnsureNoMemberConflictAsync(cls.ClassId, start, end, ct);

        var before = Describe(session);

        var result = await occupancy.ReplaceAsync(new OccupancyRequest(
            OccupancySources.ClassSession, session.SessionId, roomId, coachId, start, end), ct);

        if (!result.Succeeded)
        {
            throw new OccupancyConflictException(result.Conflicts);
        }

        var oldStart = session.StartAtUtc;
        session.StartAtUtc = start;
        session.EndAtUtc = end;
        session.RoomId = roomId;
        session.CoachId = coachId;

        audit.Write(new AuditEntry(actorUserId, "RESCHEDULE_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: before, NewValue: Describe(session), Reason: request.Reason.Trim()));

        await NotifyEnrolledAsync(cls, session.SessionId,
            $"Buổi {session.SessionNo} của khóa {cls.Name} đổi từ {Local(oldStart)} sang {Local(start)}. Lý do: {request.Reason.Trim()}", ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(sessionId, null, ct);
    }

    // ---------------------------------------------------------------- Hủy + bù

    public async Task<ClassSessionResponse> CancelWithMakeupAsync(
        Guid sessionId, CancelSessionRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var session = await LockAndLoadAsync(sessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);

        EnsureEditable(session, cls);

        var makeup = request.Makeup;
        var start = DateTime.SpecifyKind(makeup.StartAtUtc, DateTimeKind.Utc);
        var end = start + (session.EndAtUtc - session.StartAtUtc);

        if (start <= clock.UtcNow)
        {
            throw new BadRequestException("session_time_in_past", "Giờ buổi bù phải ở tương lai.");
        }

        // Buổi bù thêm ở CUỐI lịch: sau buổi cuối còn hiệu lực của khóa (không tính buổi đang hủy).
        var lastEnd = await db.Set<ClassSession>()
            .Where(s => s.ClassId == cls.ClassId && s.SessionId != sessionId && s.Status != ClassSessionStatus.Cancelled)
            .MaxAsync(s => (DateTime?)s.EndAtUtc, ct);

        if (lastEnd is DateTime last && start < last)
        {
            throw new BadRequestException(
                "makeup_must_be_after_schedule", "Buổi bù phải nằm sau buổi cuối của lịch hiện tại.");
        }

        var roomId = makeup.RoomId ?? session.RoomId;
        var coachId = makeup.CoachId ?? session.CoachId;

        await ValidateTargetAsync(cls, roomId, coachId, start, end, ct);
        await EnsureNoMemberConflictAsync(cls.ClassId, start, end, ct);

        var nextNo = await db.Set<ClassSession>().Where(s => s.ClassId == cls.ClassId).MaxAsync(s => s.SessionNo, ct) + 1;

        var newSession = new ClassSession
        {
            SessionId = Guid.NewGuid(),
            ClassId = cls.ClassId,
            SessionNo = nextNo,
            RoomId = roomId,
            CoachId = coachId,
            StartAtUtc = start,
            EndAtUtc = end,
            Status = ClassSessionStatus.Scheduled,
            RescheduledFromSessionId = sessionId,
            IsMakeup = true
        };

        // Nhả buổi cũ trước để buổi bù (nếu đè lên chính khung cũ) không tự xung đột; mọi thứ nằm trong một transaction
        // nên buổi bù xung đột thì buổi cũ không bị hủy.
        await occupancy.ReleaseAsync(OccupancySources.ClassSession, sessionId, ct);
        session.Status = ClassSessionStatus.Cancelled;

        db.Set<ClassSession>().Add(newSession);
        await db.SaveChangesAsync(ct);

        var result = await occupancy.ReserveAsync(new OccupancyRequest(
            OccupancySources.ClassSession, newSession.SessionId, roomId, coachId, start, end), ct);

        if (!result.Succeeded)
        {
            throw new OccupancyConflictException(result.Conflicts);
        }

        audit.Write(new AuditEntry(actorUserId, "CANCEL_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = ClassSessionStatus.Scheduled.ToString() }),
            NewValue: JsonSerializer.Serialize(new { status = ClassSessionStatus.Cancelled.ToString(), makeupSessionId = newSession.SessionId }),
            Reason: request.Reason.Trim()));

        await NotifyEnrolledAsync(cls, newSession.SessionId,
            $"Buổi {session.SessionNo} ({Local(session.StartAtUtc)}) của khóa {cls.Name} bị hủy và được bù vào {Local(start)}. Lý do: {request.Reason.Trim()}", ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(newSession.SessionId, null, ct);
    }

    // ---------------------------------------------------------------- Nội bộ

    private async Task<ClassSession> LockAndLoadAsync(Guid sessionId, CancellationToken ct)
    {
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        // Serialize makeup numbering and class cancellation with changes to individual sessions.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = (SELECT class_id FROM class_sessions WHERE session_id = {sessionId}) FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT session_id FROM class_sessions WHERE session_id = {sessionId} FOR UPDATE", ct);

        return await db.Set<ClassSession>().SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
               ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");
    }

    private void EnsureEditable(ClassSession session, Class cls)
    {
        if (session.Status != ClassSessionStatus.Scheduled)
        {
            throw new ConflictException("session_not_editable", "Chỉ đổi/hủy được buổi đang ở trạng thái Scheduled.");
        }

        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
        {
            throw new ConflictException("class_not_active", "Khóa không ở trạng thái đang diễn ra hoặc đã publish.");
        }

        if (session.StartAtUtc <= clock.UtcNow)
        {
            throw new ConflictException("session_started", "Buổi đã bắt đầu — không đổi/hủy được.");
        }
    }

    private async Task ValidateTargetAsync(
        Class cls, int roomId, Guid coachId,
        DateTime start, DateTime end, CancellationToken ct)
    {
        var sport = await validator.RequireGroupCourseSportAsync(cls.SportId, ct);
        var room = await validator.RequireRoomForSportAsync(roomId, cls.SportId, ct);
        CourseRules.ValidateCapacity(cls.Capacity, sport.DefaultMaxCapacity, room.Capacity);
        await validator.RequireCoachForSportAsync(coachId, cls.SportId, ct);

        if (!await openingHours.IsOpenAsync(roomId, start, end, ct))
        {
            throw new BadRequestException("session_outside_opening_hours", "Giờ mới nằm ngoài giờ mở cửa của phòng (BR-109).");
        }
    }

    /// <summary>Dời/bù có thể làm học viên đã ghi danh bị trùng buổi của khóa khác — báo Manager, không tự xử lý.</summary>
    private async Task EnsureNoMemberConflictAsync(int classId, DateTime start, DateTime end, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var bookings = db.Set<Enrollment>().Where(e => e.Status == EnrollmentStatus.Confirmed)
            .Select(e => new { e.ClassId, e.MemberId })
            .Union(db.Set<SeatHold>().Where(h => h.Status == SeatHoldStatus.Active && h.ExpiresAtUtc > now)
                .Select(h => new { h.ClassId, h.MemberId }));
        var members = bookings.Where(e => e.ClassId == classId).Select(e => e.MemberId);

        var affected = await (from e in bookings
                              where e.ClassId != classId && members.Contains(e.MemberId)
                              join s in db.Set<ClassSession>().AsNoTracking() on e.ClassId equals s.ClassId
                              where s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc < end && s.EndAtUtc > start
                              select e.MemberId).Distinct().CountAsync(ct);

        if (affected > 0)
        {
            throw new ConflictException(
                "member_schedule_conflict",
                $"{affected} học viên của khóa đã có buổi học khác trùng khung giờ mới — Manager cần xử lý trước.");
        }
    }

    private async Task NotifyEnrolledAsync(Class cls, Guid sourceId, string message, CancellationToken ct)
    {
        var memberIds = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.ClassId == cls.ClassId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => e.MemberId)
            .ToListAsync(ct);

        foreach (var memberId in memberIds)
        {
            notifications.Queue(new NotificationRequest(memberId, NotificationEvents.ScheduleChanged, message, sourceId));
        }
    }

    private async Task EnsureClassAccessAsync(int classId, Guid? restrictToCoachId, CancellationToken ct)
    {
        var coachId = await db.Set<Class>().AsNoTracking()
            .Where(c => c.ClassId == classId)
            .Select(c => new { Found = true, c.CoachId })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        if (restrictToCoachId is Guid id && coachId.CoachId != id)
        {
            throw new ForbiddenException("class_not_owned", "Coach chỉ xem được khóa mình phụ trách.");
        }
    }

    private sealed record Row(ClassSession Session, string ClassName, string RoomName);

    private static IQueryable<Row> Rows(IQueryable<ClassSession> sessions)
        => sessions.Select(s => new Row(s, s.Class!.Name, s.Room!.Name));

    private async Task<IReadOnlyList<ClassSessionResponse>> ToResponsesAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var names = await validator.CoachNamesAsync(rows.Select(r => (Guid?)r.Session.CoachId), ct);

        return rows.Select(r => new ClassSessionResponse(
            r.Session.SessionId, r.Session.ClassId, r.ClassName, r.Session.SessionNo, r.Session.RoomId, r.RoomName,
            r.Session.CoachId, names.TryGetValue(r.Session.CoachId, out var n) ? n : null,
            DateTime.SpecifyKind(r.Session.StartAtUtc, DateTimeKind.Utc), DateTime.SpecifyKind(r.Session.EndAtUtc, DateTimeKind.Utc),
            r.Session.Status.ToString(), r.Session.IsMakeup, r.Session.RescheduledFromSessionId)).ToList();
    }

    private static string Local(DateTime utc)
        => VietnamTime.ToLocal(utc).ToString("HH:mm dd/MM/yyyy");

    private static string Describe(ClassSession s)
        => JsonSerializer.Serialize(new
        {
            classId = s.ClassId,
            sessionNo = s.SessionNo,
            roomId = s.RoomId,
            coachId = s.CoachId,
            startAtUtc = s.StartAtUtc,
            endAtUtc = s.EndAtUtc,
            status = s.Status.ToString()
        });
}
