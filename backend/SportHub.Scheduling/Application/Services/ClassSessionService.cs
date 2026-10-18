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
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Lịch buổi của khóa: xem, roster, dời một buổi, hủy một buổi kèm buổi bù. Mọi thao tác đổi lịch dùng occupancy nguyên tử
/// (lịch cũ giữ nguyên nếu lịch mới xung đột), giữ nguyên ghi danh và báo cho học viên. Đổi lịch không tự hoàn tiền: số buổi
/// thực cung cấp luôn là NumSessions nhờ buổi bù.
/// </summary>
public sealed partial class ClassSessionService(
    ISportHubDbContext db,
    CourseValidator validator,
    IOccupancyService occupancy,
    RoomOpeningHourService openingHours,
    IUserAccessReader users,
    INotificationWriter notifications,
    IAuditWriter audit,
    IClock clock,
    SportHub.BuildingBlocks.Abstractions.Training.ICoachRelationshipRegistrar relationships) : IClassSessionService
{
    private static readonly TimeSpan AttendanceGrace = SessionAttendanceWindow.CorrectionWindow;
    private readonly ClassScheduleEffects scheduleEffects = new(db, users, notifications, audit, clock);

    // ---------------------------------------------------------------- Truy vấn

    public async Task<IReadOnlyList<ClassSessionResponse>> ListByClassAsync(
        int classId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        await EnsureClassAccessAsync(classId, restrictToCoachId, ct);

        var primary = restrictToCoachId == null || await CoachDataScope.Classes(db, restrictToCoachId.Value).AnyAsync(c => c.ClassId == classId, ct);
        var rows = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.ClassId == classId
            && (primary || s.CoachId == restrictToCoachId && s.Status != ClassSessionStatus.Cancelled)).OrderBy(s => s.SessionNo)).ToListAsync(ct);
        return await ToResponsesAsync(rows, ct);
    }

    public async Task<ClassSessionResponse> GetAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.SessionId == sessionId)).SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("session_not_found", "Session not found.");

        await EnsureClassAccessAsync(row.Session.ClassId, restrictToCoachId, ct);
        await EnsureSessionAccessAsync(row.Session, restrictToCoachId, ct);
        return (await ToResponsesAsync([row], ct))[0];
    }

    public async Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, Guid? restrictToCoachId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<ClassSession>().AsNoTracking().Where(s => s.SessionId == sessionId)).SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("session_not_found", "Session not found.");

        await EnsureClassAccessAsync(row.Session.ClassId, restrictToCoachId, ct);
        await EnsureSessionAccessAsync(row.Session, restrictToCoachId, ct);

        var session = (await ToResponsesAsync([row], ct))[0];

        // Ended enrollments no longer grant access to the coach's roster.
        var entries = await (from e in db.Set<Enrollment>().AsNoTracking()
                             where e.ClassId == row.Session.ClassId
                             join a in db.Set<Attendance>().AsNoTracking().Where(x => x.SessionId == sessionId)
                                 on e.EnrollmentId equals a.EnrollmentId into att
                             from a in att.DefaultIfEmpty()
                             where (e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null) || (restrictToCoachId == null && a != null)
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
            SessionAttendanceWindow.OpensAt(row.Session.StartAtUtc),
            row.Session.EndAtUtc + AttendanceGrace,
            result);
    }

    public async Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(
        Guid memberId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        if (toUtc <= fromUtc || toUtc - fromUtc > TimeSpan.FromDays(92))
        {
            throw new BadRequestException("invalid_range", "Invalid range.");
        }

        var rangeFrom = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var rangeTo = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        var sessions = await (from e in db.Set<Enrollment>().AsNoTracking()
                      where e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed
                      join s in db.Set<ClassSession>().AsNoTracking() on e.ClassId equals s.ClassId
                      where s.StartAtUtc >= rangeFrom && s.StartAtUtc < rangeTo
                      join a in db.Set<Attendance>().AsNoTracking() on new { e.EnrollmentId, s.SessionId }
                          equals new { a.EnrollmentId, a.SessionId } into att
                      from a in att.DefaultIfEmpty()
                      orderby s.StartAtUtc
                      select new
                      {
                          s.SessionId, s.ClassId, ClassName = s.Class!.Name, SportName = s.Class.Sport!.Name,
                          s.SessionNo, RoomName = s.Room!.Name, s.CoachId, s.StartAtUtc, s.EndAtUtc,
                          Status = s.Status.ToString(), s.IsMakeup,
                          AttendanceStatus = a == null ? null : a.Status.ToString()
                      })
            .ToListAsync(ct);
        var coachNames = await validator.CoachNamesAsync(sessions.Select(s => (Guid?)s.CoachId), ct);
        return sessions.Select(s => new MemberSessionResponse(
            s.SessionId, s.ClassId, s.ClassName, s.SportName, s.SessionNo, s.RoomName,
            s.StartAtUtc, s.EndAtUtc, s.Status, s.IsMakeup, s.AttendanceStatus,
            coachNames.TryGetValue(s.CoachId, out var coachName) ? coachName : null)).ToList();
    }

    // ---------------------------------------------------------------- Dời

    public async Task<ClassSessionResponse> RescheduleAsync(
        Guid sessionId, RescheduleSessionRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(ct) : null;

        var session = await LockAndLoadAsync(sessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);

        // An unconfirmed class never started teaching. After downtime its expired
        // planned session may be deferred, while actual teaching history stays immutable.
        var deferredOpening = cls.Status == ClassStatus.Published && session.Status == ClassSessionStatus.Scheduled
            && cls.ThresholdStatus is SportHub.Scheduling.Threshold.Domain.ThresholdStatus.NotEvaluated
                or SportHub.Scheduling.Threshold.Domain.ThresholdStatus.AtRisk
            && !await db.Set<Attendance>().AnyAsync(a => a.SessionId == sessionId, ct)
            && !await db.Set<ClassTeachingRecord>().AnyAsync(r => r.SessionId == sessionId, ct);
        if (!deferredOpening) EnsureEditable(session, cls);

        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = start + (session.EndAtUtc - session.StartAtUtc);

        if (start <= clock.UtcNow)
        {
            throw new BadRequestException("session_time_in_past", "Session time in past.");
        }

        var roomId = request.RoomId ?? session.RoomId;
        var coachId = request.CoachId ?? session.CoachId;

        // The class/session locks also serialize simultaneous identical requests.
        // Reaching the same target again is not another schedule-change event.
        if (start == session.StartAtUtc && end == session.EndAtUtc
            && roomId == session.RoomId && coachId == session.CoachId)
        {
            if (tx != null) await tx.CommitAsync(ct);
            return await GetAsync(sessionId, null, ct);
        }

        await ValidateTargetAsync(cls, roomId, coachId, start, end, ct);
        await EnsureNoMemberConflictAsync(cls.ClassId, start, end, ct, sessionId);

        var before = Describe(session);

        var result = await occupancy.ReplaceAsync(new OccupancyRequest(
            OccupancySources.ClassSession, session.SessionId, roomId, coachId, start, end), ct);

        if (!result.Succeeded)
        {
            throw new OccupancyConflictException(result.Conflicts);
        }

        var oldStart = session.StartAtUtc;
        var oldEnd = session.EndAtUtc;
        var oldCoach = session.CoachId;
        var oldRoom = session.RoomId;
        session.StartAtUtc = start;
        session.EndAtUtc = end;
        session.RoomId = roomId;
        session.CoachId = coachId;

        await UpdateOpeningScheduleAsync(cls, sessionId, oldStart, start, ct);

        audit.Write(new AuditEntry(actorUserId, "RESCHEDULE_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: before, NewValue: Describe(session), Reason: request.Reason.Trim()));
        await RecordFenceStepAsync(IncidentFenceStepKind.Reschedule, session, oldStart, oldEnd, oldRoom, oldCoach,
            null, start, roomId, coachId, actorUserId, ct);

        var oldCoachName = (await users.GetAsync(oldCoach, ct))?.FullName ?? oldCoach.ToString();
        var nextCoachName = (await users.GetAsync(coachId, ct))?.FullName ?? coachId.ToString();
        var message = $"Session {session.SessionNo} · {cls.Name}: {Local(oldStart)} → {Local(start)}. Coach: {oldCoachName} → {nextCoachName}. Room: {oldRoom} → {roomId}. Reason: {request.Reason.Trim()}";
        await NotifyEnrolledAsync(cls, Guid.NewGuid(), message, ct);
        await scheduleEffects.ApplyAsync(cls, session, actorUserId, oldCoach, sessionId, coachId, message, ct,
            start != oldStart ? "RESCHEDULE" : coachId != oldCoach ? "SUBSTITUTE" : roomId != oldRoom ? "ROOM_CHANGED" : "SCHEDULE_UPDATED", request.Reason.Trim());

        await db.SaveChangesAsync(ct);
        if (tx != null) await tx.CommitAsync(ct);

        return await GetAsync(sessionId, null, ct);
    }

    // ---------------------------------------------------------------- Hủy + bù

    public Task<ClassSessionResponse> CancelWithMakeupAsync(
        Guid sessionId, CancelSessionRequest request, Guid actorUserId, CancellationToken ct = default)
        => CancelWithMakeupCoreAsync(sessionId, request, actorUserId, ct);

    private async Task<ClassSessionResponse> CancelWithMakeupCoreAsync(
        Guid sessionId, CancelSessionRequest request, Guid actorUserId, CancellationToken ct, Guid? incidentFenceId = null)
    {
        await using var tx = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(ct) : null;

        var session = await LockAndLoadAsync(sessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);

        if (incidentFenceId is null) EnsureEditable(session, cls);
        var previousStatus = session.Status;

        var makeup = request.Makeup;
        var start = DateTime.SpecifyKind(makeup.StartAtUtc, DateTimeKind.Utc);
        var end = start + (session.EndAtUtc - session.StartAtUtc);

        if (start <= clock.UtcNow)
        {
            throw new BadRequestException("session_time_in_past", "Session time in past.");
        }

        // Buổi bù thêm ở CUỐI lịch: sau buổi cuối còn hiệu lực của khóa (không tính buổi đang hủy).
        var lastEnd = await db.Set<ClassSession>()
            .Where(s => s.ClassId == cls.ClassId && s.SessionId != sessionId && s.Status != ClassSessionStatus.Cancelled)
            .MaxAsync(s => (DateTime?)s.EndAtUtc, ct);

        if (lastEnd is DateTime last && start < last)
        {
            throw new BadRequestException(
                "makeup_must_be_after_schedule", "Makeup must be after schedule.");
        }

        var roomId = makeup.RoomId ?? session.RoomId;
        var coachId = makeup.CoachId ?? session.CoachId;

        await ValidateTargetAsync(cls, roomId, coachId, start, end, ct);
        await EnsureNoMemberConflictAsync(cls.ClassId, start, end, ct, sessionId);

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

        await RecordFenceStepAsync(IncidentFenceStepKind.CancelWithMakeup, session, session.StartAtUtc, session.EndAtUtc,
            session.RoomId, session.CoachId, newSession.SessionId, start, roomId, coachId, actorUserId, ct, incidentFenceId);
        audit.Write(new AuditEntry(actorUserId, "CANCEL_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = previousStatus.ToString() }),
            NewValue: JsonSerializer.Serialize(new { status = ClassSessionStatus.Cancelled.ToString(), makeupSessionId = newSession.SessionId }),
            Reason: request.Reason.Trim()));

        await NotifyEnrolledAsync(cls, newSession.SessionId,
            $"Session {session.SessionNo} ({Local(session.StartAtUtc)}) of course {cls.Name} was canceled and rescheduled for {Local(start)}. Reason: {request.Reason.Trim()}", ct);
        await scheduleEffects.ApplyAsync(cls, session, actorUserId, session.CoachId, newSession.SessionId, coachId,
            $"Session {session.SessionNo} · {cls.Name} at {Local(session.StartAtUtc)} was cancelled. Makeup: {Local(start)}. Coach: {(await users.GetAsync(coachId, ct))?.FullName}. Reason: {request.Reason.Trim()}", ct,
            "CANCEL_WITH_MAKEUP", request.Reason.Trim());

        await db.SaveChangesAsync(ct);
        if (tx != null) await tx.CommitAsync(ct);

        return await GetAsync(newSession.SessionId, null, ct);
    }

    // ---------------------------------------------------------------- Sự cố: ghi bước và hoàn tác

    /// <summary>
    /// If the session's ORIGINAL slot lies inside an incident window the manager is holding, remember how to put it back.
    /// Without a held window nothing is recorded: the manager chose to change the schedule outside incident handling.
    /// </summary>
    private async Task RecordFenceStepAsync(IncidentFenceStepKind kind, ClassSession session, DateTime beforeStart,
        DateTime beforeEnd, int beforeRoom, Guid beforeCoach, Guid? makeupSessionId, DateTime afterStart, int afterRoom,
        Guid afterCoach, Guid actorUserId, CancellationToken ct, Guid? requestedFenceId = null)
    {
        var fenceId = await db.Set<IncidentFence>().AsNoTracking()
            .Where(f => (!requestedFenceId.HasValue || f.FenceId == requestedFenceId) && f.Status == IncidentFenceStatus.Open && f.StartAtUtc < beforeEnd && f.EndAtUtc > beforeStart
                        && (f.Scope == IncidentScope.Center || f.RoomId == beforeRoom))
            .OrderBy(f => f.CreatedAtUtc).Select(f => (Guid?)f.FenceId).FirstOrDefaultAsync(ct);
        if (fenceId is null) return;
        db.Set<IncidentFenceStep>().Add(new IncidentFenceStep
        {
            StepId = Guid.NewGuid(), FenceId = fenceId.Value, Kind = kind, SessionId = session.SessionId,
            MakeupSessionId = makeupSessionId, BeforeStartUtc = beforeStart, BeforeEndUtc = beforeEnd,
            BeforeRoomId = beforeRoom, BeforeCoachId = beforeCoach, AfterStartUtc = afterStart, AfterRoomId = afterRoom,
            AfterCoachId = afterCoach, ActorUserId = actorUserId, CreatedAtUtc = clock.UtcNow,
            State = IncidentFenceStepState.Applied
        });
    }

    public async Task<SessionStepUndoOutcome> UndoIncidentStepAsync(Guid stepId, Guid actorUserId, CancellationToken ct = default)
    {
        var step = await db.Set<IncidentFenceStep>().SingleOrDefaultAsync(s => s.StepId == stepId, ct)
            ?? throw new NotFoundException("incident_step_not_found", "Incident step not found.");
        if (step.State == IncidentFenceStepState.Undone) return new(true, null);

        async Task<SessionStepUndoOutcome> Fail(string note)
        {
            step.State = IncidentFenceStepState.UndoFailed;
            step.UndoNote = note;
            await db.SaveChangesAsync(ct);
            return new(false, note);
        }

        var session = await LockAndLoadAsync(step.SessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);
        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
            return await Fail("The course is no longer running.");
        if (step.BeforeStartUtc <= clock.UtcNow)
            return await Fail("The original time has already passed.");

        if (step.Kind == IncidentFenceStepKind.Reschedule)
        {
            if (session.Status != ClassSessionStatus.Scheduled || session.StartAtUtc != step.AfterStartUtc
                || session.RoomId != step.AfterRoomId || session.CoachId != step.AfterCoachId)
                return await Fail("The session was changed again after this step, so it was left as it is.");

            var moved = await occupancy.ReplaceAsync(new OccupancyRequest(OccupancySources.ClassSession, session.SessionId,
                step.BeforeRoomId, step.BeforeCoachId, step.BeforeStartUtc, step.BeforeEndUtc), ct);
            if (!moved.Succeeded) return await Fail("The original room or coach is no longer free at that time.");

            var movedFrom = session.StartAtUtc;
            var departedCoach = session.CoachId;
            var departedRoom = session.RoomId;
            session.StartAtUtc = step.BeforeStartUtc;
            session.EndAtUtc = step.BeforeEndUtc;
            session.RoomId = step.BeforeRoomId;
            session.CoachId = step.BeforeCoachId;
            await UpdateOpeningScheduleAsync(cls, session.SessionId, movedFrom, session.StartAtUtc, ct);
            audit.Write(new AuditEntry(actorUserId, "UNDO_RESCHEDULE_CLASS_SESSION", nameof(ClassSession),
                session.SessionId.ToString(), NewValue: Describe(session), Reason: "Incident abandoned"));
            var message = $"Session {session.SessionNo} of course {cls.Name} is back at {Local(session.StartAtUtc)} (it had been moved to {Local(movedFrom)}). The earlier change was cancelled. "
                + await RestorationDetailsAsync(departedCoach, session.CoachId, departedRoom, session.RoomId, ct);
            var eventId = Guid.NewGuid();
            await NotifyEnrolledAsync(cls, eventId, message, ct);
            await scheduleEffects.NotifyCoachesAsync(cls, departedCoach, session.CoachId, message, ct, eventId);
        }
        else
        {
            var makeup = step.MakeupSessionId is Guid makeupId
                ? await db.Set<ClassSession>().SingleOrDefaultAsync(s => s.SessionId == makeupId, ct) : null;
            if (session.Status != ClassSessionStatus.Cancelled || makeup is null
                || makeup.Status != ClassSessionStatus.Scheduled || makeup.StartAtUtc != step.AfterStartUtc)
                return await Fail("The makeup session was changed after this step, so it was left as it is.");

            // Take the original slot back first; if that fails nothing has changed.
            var back = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.ClassSession, session.SessionId,
                step.BeforeRoomId, step.BeforeCoachId, step.BeforeStartUtc, step.BeforeEndUtc), ct);
            if (!back.Succeeded) return await Fail("The original room or coach is no longer free at that time.");

            await occupancy.ReleaseAsync(OccupancySources.ClassSession, makeup.SessionId, ct);
            makeup.Status = ClassSessionStatus.Cancelled;
            session.Status = ClassSessionStatus.Scheduled;
            audit.Write(new AuditEntry(actorUserId, "UNDO_CANCEL_CLASS_SESSION", nameof(ClassSession),
                session.SessionId.ToString(), NewValue: Describe(session), Reason: "Incident abandoned"));
            var message = $"Session {session.SessionNo} of course {cls.Name} will go ahead as originally planned at {Local(session.StartAtUtc)}. The makeup on {Local(makeup.StartAtUtc)} was cancelled. "
                + await RestorationDetailsAsync(makeup.CoachId, session.CoachId, makeup.RoomId, session.RoomId, ct);
            var eventId = Guid.NewGuid();
            await NotifyEnrolledAsync(cls, eventId, message, ct);
            await scheduleEffects.NotifyCoachesAsync(cls, makeup.CoachId, session.CoachId, message, ct, eventId);
        }

        step.State = IncidentFenceStepState.Undone;
        step.UndoneAtUtc = clock.UtcNow;
        step.UndoNote = null;
        await db.SaveChangesAsync(ct);
        return new(true, null);
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
               ?? throw new NotFoundException("session_not_found", "Session not found.");
    }

    private void EnsureEditable(ClassSession session, Class cls)
    {
        if (session.Status != ClassSessionStatus.Scheduled)
        {
            throw new ConflictException("session_not_editable", "Session not editable.");
        }

        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress))
        {
            throw new ConflictException("class_not_active", "Class not active.");
        }

        if (session.StartAtUtc <= clock.UtcNow)
        {
            throw new ConflictException("session_started", "Session started.");
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
            throw new BadRequestException("session_outside_opening_hours", "Session outside opening hours.");
        }
    }

    /// <summary>Dời/bù có thể làm học viên đã ghi danh bị trùng buổi của khóa khác — báo Manager, không tự xử lý.</summary>
    private async Task EnsureNoMemberConflictAsync(int classId, DateTime start, DateTime end, CancellationToken ct, Guid? excludeSessionId = null)
    {
        var now = clock.UtcNow;
        var bookings = db.Set<Enrollment>().Where(e => e.Status == EnrollmentStatus.Confirmed)
            .Select(e => new { e.ClassId, e.MemberId })
            .Union(db.Set<SeatHold>().Where(h => h.Status == SeatHoldStatus.Active && h.ExpiresAtUtc > now)
                .Select(h => new { h.ClassId, h.MemberId }));
        var members = bookings.Where(e => e.ClassId == classId).Select(e => e.MemberId);

        var affected = await (from e in bookings
                              where members.Contains(e.MemberId)
                              join s in db.Set<ClassSession>().AsNoTracking() on e.ClassId equals s.ClassId
                              where s.SessionId != excludeSessionId && s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc < end && s.EndAtUtc > start
                              select e.MemberId).Distinct().CountAsync(ct);

        var rentalConflict = await db.Set<CourtRental>().AnyAsync(r => members.Contains(r.MemberId)
            && (r.Status == CourtRentalStatus.Confirmed || r.Status == CourtRentalStatus.PendingPayment)
            && r.StartAtUtc < end && r.EndAtUtc > start, ct);
        if (affected > 0 || rentalConflict)
        {
            throw new ConflictException(
                "member_schedule_conflict",
                "Member schedule conflict.");
        }
    }

    private async Task UpdateOpeningScheduleAsync(Class cls, Guid sessionId, DateTime oldStart, DateTime newStart, CancellationToken ct)
    {
        if (cls.Status != ClassStatus.Published || oldStart == newStart) return;
        var otherFirst = await db.Set<ClassSession>().Where(s => s.ClassId == cls.ClassId
            && s.SessionId != sessionId && s.Status != ClassSessionStatus.Cancelled)
            .MinAsync(s => (DateTime?)s.StartAtUtc, ct);
        var before = otherFirst.HasValue && otherFirst < oldStart ? otherFirst.Value : oldStart;
        var after = otherFirst.HasValue && otherFirst < newStart ? otherFirst.Value : newStart;
        if (before == after) return;
        if (cls.ThresholdStatus == SportHub.Scheduling.Threshold.Domain.ThresholdStatus.AtRisk
            && cls.ThresholdResponseDeadlineUtc is DateTime responseEnd && after < responseEnd.AddHours(24))
            throw new ConflictException("threshold_response_window_conflict", "The first session must remain at least 24 hours after the member response deadline.");
        cls.StartDate = DateOnly.FromDateTime(VietnamTime.ToLocal(after));
        if (cls.ThresholdResponseDeadlineUtc is null)
        {
            cls.ThresholdDeadlineUtc = cls.ThresholdDeadlineUtc?.Add(after - before);
            if (cls.ThresholdStatus == SportHub.Scheduling.Threshold.Domain.ThresholdStatus.AtRisk)
                cls.ThresholdStatus = SportHub.Scheduling.Threshold.Domain.ThresholdStatus.NotEvaluated;
        }
        cls.Version++;
    }

    private async Task<string> RestorationDetailsAsync(Guid departedCoach, Guid restoredCoach,
        int departedRoom, int restoredRoom, CancellationToken ct)
    {
        var oldName = (await users.GetAsync(departedCoach, ct))?.FullName ?? departedCoach.ToString();
        var newName = (await users.GetAsync(restoredCoach, ct))?.FullName ?? restoredCoach.ToString();
        var roomNames = await db.Set<Room>().AsNoTracking()
            .Where(r => r.RoomId == departedRoom || r.RoomId == restoredRoom)
            .ToDictionaryAsync(r => r.RoomId, r => r.Name, ct);
        return $"Coach: {oldName} → {newName}. Room: {roomNames.GetValueOrDefault(departedRoom, departedRoom.ToString())} → {roomNames.GetValueOrDefault(restoredRoom, restoredRoom.ToString())}. Reason: incident abandoned. Enrollment remains valid; follow the restored session schedule.";
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
            var recipient = await users.GetAsync(memberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(memberId, recipient.Email,
                    NotificationEvents.ScheduleChanged, sourceId, "SportHub - Course schedule changed",
                    "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
        }
    }

    private async Task EnsureClassAccessAsync(int classId, Guid? restrictToCoachId, CancellationToken ct)
    {
        var coachId = await db.Set<Class>().AsNoTracking()
            .Where(c => c.ClassId == classId)
            .Select(c => new { Found = true, c.CoachId, c.Status })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");

        if (restrictToCoachId != null && coachId.Status is not (ClassStatus.Published or ClassStatus.InProgress))
            throw new ForbiddenException("class_access_ended", "Access is no longer available for this class.");
        if (restrictToCoachId is Guid id && coachId.CoachId != id &&
            !await db.Set<ClassSession>().AnyAsync(s => s.ClassId == classId && s.CoachId == id && s.Status != ClassSessionStatus.Cancelled, ct))
        {
            throw new ForbiddenException("class_not_owned", "Class not owned.");
        }
    }

    private sealed record Row(ClassSession Session, string ClassName, string RoomName);

    private async Task EnsureSessionAccessAsync(ClassSession session, Guid? coachId, CancellationToken ct)
    {
        if (coachId.HasValue && (session.CoachId != coachId || session.Status == ClassSessionStatus.Cancelled) &&
            !await CoachDataScope.Classes(db, coachId.Value).AnyAsync(c => c.ClassId == session.ClassId, ct))
            throw new ForbiddenException("session_not_assigned", "You are not assigned to this session.");
    }

    private static IQueryable<Row> Rows(IQueryable<ClassSession> sessions)
        => sessions.Select(s => new Row(s, s.Class!.Name, s.Room!.Name));

    private async Task<IReadOnlyList<ClassSessionResponse>> ToResponsesAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var names = await validator.CoachNamesAsync(rows.Select(r => (Guid?)r.Session.CoachId), ct);

        return rows.Select(r => new ClassSessionResponse(
            r.Session.SessionId, r.Session.ClassId, r.ClassName, r.Session.SessionNo, r.Session.RoomId, r.RoomName,
            r.Session.CoachId, names.TryGetValue(r.Session.CoachId, out var n) ? n : null,
            DateTime.SpecifyKind(r.Session.StartAtUtc, DateTimeKind.Utc), DateTime.SpecifyKind(r.Session.EndAtUtc, DateTimeKind.Utc),
            r.Session.Status.ToString(), r.Session.IsMakeup, r.Session.RescheduledFromSessionId,
            ReadIncidentReport(r.Session.IncidentReportJson))).ToList();
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
