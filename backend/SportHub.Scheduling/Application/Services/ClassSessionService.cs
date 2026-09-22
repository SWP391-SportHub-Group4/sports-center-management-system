using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Buổi học — BR-15 (thừa hưởng khung giờ từ recurrence), BR-51 (trần sức chứa chốt lúc tạo),
/// BR-54 (hủy/dời: hoàn lượt, không phạt, dời thì tạo buổi thay thế có liên kết).
/// </summary>
public sealed class ClassSessionService(
    ISportHubDbContext db,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock) : IClassSessionService
{
    public async Task<IReadOnlyList<ClassSessionResponse>> SearchAsync(
        DateOnly fromDate,
        DateOnly toDate,
        int? classId,
        Guid? coachId,
        string? discipline,
        bool includeCancelled,
        CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        // Biên theo ngày GIỜ VN quy đổi sang UTC — cắt theo ngày UTC sẽ đẩy nhầm buổi tập
        // sáng sớm (trước 07:00 giờ VN) sang ngày hôm trước.
        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var query = db.Set<ClassSession>()
            .AsNoTracking()
            .Where(s => s.StartAtUtc >= fromUtc && s.StartAtUtc < toUtc);

        if (!includeCancelled)
        {
            query = query.Where(s => s.Status != ClassSessionStatus.Cancelled);
        }

        if (classId is not null)
        {
            query = query.Where(s => s.ClassId == classId);
        }

        if (coachId is not null)
        {
            query = query.Where(s => s.CoachId == coachId);
        }

        if (!string.IsNullOrWhiteSpace(discipline))
        {
            query = query.Where(s => s.Class!.Discipline == discipline);
        }

        return await query.OrderBy(s => s.StartAtUtc).Select(Projection()).ToListAsync(ct);
    }

    public async Task<ClassSessionResponse> GetAsync(Guid sessionId, CancellationToken ct = default)
        => await db.Set<ClassSession>().AsNoTracking().Where(s => s.SessionId == sessionId).Select(Projection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

    /// <summary>
    /// BR-15 — sinh buổi học từ các mẫu lặp của lớp trong khoảng ngày yêu cầu.
    ///
    /// Idempotent: buổi đã tồn tại đúng (recurrence, thời điểm bắt đầu) thì bỏ qua, nên chạy
    /// lại cùng khoảng ngày không nhân đôi lịch. Nếu không, mỗi lần Manager bấm "sinh lịch"
    /// lại lớp lên một tầng buổi trùng giờ.
    /// </summary>
    public async Task<IReadOnlyList<ClassSessionResponse>> GenerateAsync(
        int classId,
        GenerateSessionsRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var entity = await db.Set<Class>()
            .Include(c => c.Recurrences)
            .Include(c => c.DefaultRoom)
            .SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

        if (entity.Status != ClassStatus.Active)
        {
            throw new ConflictException("class_archived", "Lớp đã ngừng hoạt động, không sinh thêm buổi học.");
        }

        if (entity.DefaultCoachId is null)
        {
            // ClassSession.CoachId là not-null (SSOT §2) nên không có HLV thì không sinh được
            // buổi. BR-12 cho phép gán HLV sau — sinh lịch chính là lúc "sau" đó phải xong.
            throw new ConflictException(
                "class_has_no_coach",
                "Lớp chưa được phân công HLV mặc định — không sinh được buổi học (BR-12, BR-14).");
        }

        if (entity.Recurrences.Count == 0)
        {
            throw new ConflictException("class_has_no_recurrence", "Lớp chưa có mẫu lịch lặp nào.");
        }

        var (fromDate, toDate) = request.ToDate < request.FromDate
            ? (request.ToDate, request.FromDate)
            : (request.FromDate, request.ToDate);

        if (toDate.DayNumber - fromDate.DayNumber > 366)
        {
            throw new BadRequestException("range_too_large", "Chỉ sinh lịch tối đa 366 ngày mỗi lần.");
        }

        var existingStarts = await db.Set<ClassSession>()
            .Where(s => s.ClassId == classId
                        && s.StartAtUtc >= VietnamTime.StartOfDayUtc(fromDate)
                        && s.StartAtUtc < VietnamTime.EndOfDayExclusiveUtc(toDate))
            .Select(s => s.StartAtUtc)
            .ToListAsync(ct);

        var existing = existingStarts.ToHashSet();
        var created = new List<ClassSession>();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        foreach (var recurrence in entity.Recurrences)
        {
            var days = recurrence.DaysOfWeek
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(ClassService.DayCodes.ContainsKey)
                .Select(d => ClassService.DayCodes[d])
                .ToHashSet();

            for (var day = fromDate; day <= toDate; day = day.AddDays(1))
            {
                if (day < recurrence.EffectiveFrom || (recurrence.EffectiveTo is not null && day > recurrence.EffectiveTo))
                {
                    continue;
                }

                if (!days.Contains(day.ToDateTime(TimeOnly.MinValue).DayOfWeek))
                {
                    continue;
                }

                var startUtc = VietnamTime.ToUtc(day.ToDateTime(recurrence.StartTimeLocal));

                if (!existing.Add(startUtc))
                {
                    continue;
                }

                var endUtc = VietnamTime.ToUtc(day.ToDateTime(recurrence.EndTimeLocal));

                // Buổi trùng phòng/HLV được BỎ QUA chứ không làm hỏng cả lệnh sinh lịch:
                // sinh lịch chạy trên cả trăm ngày, dừng vì một ngày lễ trùng lịch sẽ khiến
                // Manager không sinh được phần còn lại (quyết định C5).
                if (await HasRoomConflictAsync(entity.DefaultRoomId, startUtc, endUtc, null, ct)
                    || await HasCoachConflictAsync(entity.DefaultCoachId.Value, startUtc, endUtc, null, ct))
                {
                    continue;
                }

                var baseline = SessionRules.ComputeBaselineCapacity(entity.DefaultRoom!.Capacity, entity.Capacity);

                var session = new ClassSession
                {
                    SessionId = Guid.NewGuid(),
                    ClassId = classId,
                    RecurrenceId = recurrence.RecurrenceId,
                    RoomId = entity.DefaultRoomId,
                    CoachId = entity.DefaultCoachId.Value,
                    StartAtUtc = startUtc,
                    EndAtUtc = endUtc,

                    // BR-51 — trần chốt tại đây, một lần, và không bao giờ tính lại.
                    BaselineCapacity = baseline,
                    Capacity = baseline,
                    ConfirmedCount = 0,
                    Status = ClassSessionStatus.Scheduled
                };

                // Ràng buộc "PT thì sức chứa = 1" đọc Discipline của lớp cha nên là ràng buộc
                // xuyên bảng — DB CHECK không đặt được, service phải tự soi (ClassRules).
                ClassRules.ValidateSessionCapacity(entity.Discipline, session.Capacity);

                db.Set<ClassSession>().Add(session);
                created.Add(session);
            }
        }

        audit.Write(new AuditEntry(
            actorUserId, "GENERATE_CLASS_SESSIONS", nameof(Class), classId.ToString(),
            NewValue: $"{{\"from\":\"{fromDate:yyyy-MM-dd}\",\"to\":\"{toDate:yyyy-MM-dd}\","
                      + $"\"created\":{created.Count}}}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        var ids = created.Select(s => s.SessionId).ToList();

        return await db.Set<ClassSession>().AsNoTracking()
            .Where(s => ids.Contains(s.SessionId))
            .OrderBy(s => s.StartAtUtc)
            .Select(Projection())
            .ToListAsync(ct);
    }

    public async Task<ClassSessionResponse> CreateAdHocAsync(
        CreateAdHocSessionRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var entity = await db.Set<Class>()
            .Include(c => c.DefaultRoom)
            .SingleOrDefaultAsync(c => c.ClassId == request.ClassId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

        var roomId = request.RoomId ?? entity.DefaultRoomId;
        var coachId = request.CoachId ?? entity.DefaultCoachId
            ?? throw new ConflictException(
                "class_has_no_coach", "Lớp chưa có HLV mặc định — phải chỉ định HLV cho buổi này (BR-14).");

        var session = await BuildSessionAsync(
            entity, roomId, coachId, request.StartAtUtc, request.EndAtUtc, excludeSessionId: null, ct);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<ClassSession>().Add(session);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_CLASS_SESSION", nameof(ClassSession), session.SessionId.ToString(),
            NewValue: Describe(session)));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(session.SessionId, ct);
    }

    public async Task<ClassSessionResponse> UpdateAsync(
        Guid sessionId,
        UpdateSessionRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var session = await db.Set<ClassSession>()
            .Include(s => s.Class)
            .SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        if (session.Status != ClassSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "session_not_scheduled", $"Buổi học đang ở trạng thái {session.Status}, không sửa được.");
        }

        var before = Describe(session);
        var scheduleChanged = false;

        if (request.RoomId is not null && request.RoomId != session.RoomId)
        {
            var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == request.RoomId, ct)
                ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");

            if (await HasRoomConflictAsync(room.RoomId, session.StartAtUtc, session.EndAtUtc, sessionId, ct))
            {
                throw new ConflictException("room_conflict", "Phòng tập đã có buổi học khác trùng giờ.");
            }

            session.RoomId = room.RoomId;

            // Phòng nhỏ hơn siết trần hiệu lực xuống; phòng lớn hơn KHÔNG nới trần gốc (BR-51).
            if (session.Capacity > room.Capacity)
            {
                session.Capacity = Math.Min(session.BaselineCapacity, room.Capacity);
            }

            scheduleChanged = true;
        }

        if (request.CoachId is not null && request.CoachId != session.CoachId)
        {
            var isCoach = await db.Set<UserAccount>()
                .AnyAsync(u => u.UserId == request.CoachId && u.Role!.RoleName == UserRole.Coach, ct);

            if (!isCoach)
            {
                throw new BadRequestException("coach_not_found", "Tài khoản được gán không có vai trò Coach.");
            }

            if (await HasCoachConflictAsync(request.CoachId.Value, session.StartAtUtc, session.EndAtUtc, sessionId, ct))
            {
                throw new ConflictException("coach_conflict", "HLV đã có buổi dạy khác trùng giờ.");
            }

            session.CoachId = request.CoachId.Value;
            scheduleChanged = true;
        }

        if (request.Capacity is not null && request.Capacity != session.Capacity)
        {
            var room = await db.Set<Room>().SingleAsync(r => r.RoomId == session.RoomId, ct);

            SessionRules.ValidateCapacityChange(request.Capacity.Value, session.BaselineCapacity, room.Capacity);
            ClassRules.ValidateSessionCapacity(session.Class!.Discipline, request.Capacity.Value);

            // Không hạ sức chứa xuống dưới số người ĐÃ xác nhận: BR-54 chỉ cho huỷ đăng ký khi
            // huỷ/dời cả buổi, không có đường nào "đẩy bớt" người ra khỏi buổi vẫn diễn ra.
            if (request.Capacity.Value < session.ConfirmedCount)
            {
                throw new ConflictException(
                    "capacity_below_confirmed",
                    $"Đã có {session.ConfirmedCount} đăng ký xác nhận — không hạ sức chứa thấp hơn con số này.");
            }

            session.Capacity = request.Capacity.Value;
        }

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: before, NewValue: Describe(session)));

        // BR-33 — hội viên được báo khi lịch học của họ thay đổi (đổi phòng hoặc đổi HLV).
        if (scheduleChanged)
        {
            await NotifyConfirmedMembersAsync(
                sessionId,
                NotificationEvents.ScheduleChanged,
                $"Buổi học {session.Class!.Name} lúc "
                + $"{VietnamTime.ToLocal(session.StartAtUtc):HH:mm dd/MM/yyyy} có thay đổi về phòng tập hoặc HLV. "
                + "Đăng ký của bạn vẫn giữ nguyên.",
                ct);
        }

        await db.SaveChangesAsync(ct);

        return await GetAsync(sessionId, ct);
    }

    /// <summary>
    /// BR-54 — trung tâm hủy buổi chưa bắt đầu: hủy các đăng ký còn hiệu lực, HOÀN LƯỢT,
    /// KHÔNG áp dụng phạt hủy trễ/No-show, và báo cho từng hội viên là cần tự đăng ký lại.
    /// </summary>
    public async Task<ClassSessionResponse> CancelAsync(
        Guid sessionId,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var session = await db.Set<ClassSession>()
            .Include(s => s.Class)
            .SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        SessionRules.EnsureCancellableOrReschedulable(session, clock.UtcNow);

        var releasedCount = await ReleaseEnrollmentsAsync(session, reason, actorUserId, replacement: null, ct);

        session.Status = ClassSessionStatus.Cancelled;
        session.ConfirmedCount = 0;

        audit.Write(new AuditEntry(
            actorUserId, "CANCEL_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: $"{{\"status\":\"{ClassSessionStatus.Scheduled}\"}}",
            NewValue: $"{{\"status\":\"{ClassSessionStatus.Cancelled}\",\"releasedEnrollments\":{releasedCount}}}",
            Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(sessionId, ct);
    }

    /// <summary>
    /// BR-54 — dời lịch: TẠO BUỔI THAY THẾ và lưu liên kết về buổi cũ
    /// (ClassSession.RescheduledFromSessionId), buổi cũ chuyển sang Rescheduled.
    ///
    /// Hệ thống KHÔNG tự chuyển đăng ký sang buổi mới và không giữ chỗ — BR-54 nói rõ hội viên
    /// phải chủ động đăng ký lại theo điều kiện thông thường.
    /// </summary>
    public async Task<ClassSessionResponse> RescheduleAsync(
        Guid sessionId,
        RescheduleSessionRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var session = await db.Set<ClassSession>()
            .Include(s => s.Class).ThenInclude(c => c!.DefaultRoom)
            .SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        SessionRules.EnsureCancellableOrReschedulable(session, clock.UtcNow);

        var replacement = await BuildSessionAsync(
            session.Class!,
            request.NewRoomId ?? session.RoomId,
            request.NewCoachId ?? session.CoachId,
            request.NewStartAtUtc,
            request.NewEndAtUtc,
            excludeSessionId: sessionId,
            ct);

        replacement.RecurrenceId = session.RecurrenceId;
        replacement.RescheduledFromSessionId = sessionId;

        db.Set<ClassSession>().Add(replacement);

        var releasedCount = await ReleaseEnrollmentsAsync(session, request.Reason, actorUserId, replacement, ct);

        session.Status = ClassSessionStatus.Rescheduled;
        session.ConfirmedCount = 0;

        audit.Write(new AuditEntry(
            actorUserId, "RESCHEDULE_CLASS_SESSION", nameof(ClassSession), sessionId.ToString(),
            OldValue: $"{{\"status\":\"{ClassSessionStatus.Scheduled}\",\"startAtUtc\":\"{session.StartAtUtc:O}\"}}",
            NewValue: $"{{\"status\":\"{ClassSessionStatus.Rescheduled}\","
                      + $"\"replacementSessionId\":\"{replacement.SessionId}\","
                      + $"\"newStartAtUtc\":\"{replacement.StartAtUtc:O}\",\"releasedEnrollments\":{releasedCount}}}",
            Reason: request.Reason.Trim()));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(replacement.SessionId, ct);
    }

    public async Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, CancellationToken ct = default)
    {
        var session = await GetAsync(sessionId, ct);

        var entries = await db.Set<Enrollment>()
            .AsNoTracking()
            .Where(e => e.SessionId == sessionId)
            .OrderBy(e => e.Member!.Email)
            .Select(e => new RosterEntryResponse(
                e.EnrollmentId,
                e.MemberId,
                e.Member!.Email,
                e.Member.Profile != null ? e.Member.Profile.FullName : string.Empty,
                e.Status.ToString(),
                e.Attendance == null ? null : e.Attendance.Status.ToString(),
                e.Attendance == null ? null : e.Attendance.CheckInTime))
            .ToListAsync(ct);

        return new SessionRosterResponse(session, entries);
    }

    /// <summary>
    /// BR-54/BR-18 — hủy đăng ký còn hiệu lực và hoàn lượt. Phân loại luôn là CancelledOnTime
    /// bất kể hạn hủy của hội viên: BR-18 nói rõ "trường hợp trung tâm hủy hoặc dời buổi học
    /// áp dụng quy tắc riêng, không phụ thuộc hạn hủy của hội viên".
    /// </summary>
    private async Task<int> ReleaseEnrollmentsAsync(
        ClassSession session,
        string reason,
        Guid actorUserId,
        ClassSession? replacement,
        CancellationToken ct)
    {
        var enrollments = await db.Set<Enrollment>()
            .Where(e => e.SessionId == session.SessionId && e.Status == EnrollmentStatus.Confirmed)
            .ToListAsync(ct);

        if (enrollments.Count == 0)
        {
            return 0;
        }

        var packageIds = enrollments.Select(e => e.MemberPackageId).Distinct().ToList();

        var packages = await db.Set<MemberPackage>()
            .Where(mp => packageIds.Contains(mp.MemberPackageId))
            .ToListAsync(ct);

        // BR-10 — một truy vấn cho cả lô thay vì một truy vấn mỗi enrollment: buổi học đông
        // có thể có vài chục đăng ký và vòng lặp N+1 ở đây nằm trong transaction hủy buổi.
        var memberIds = packages.Select(p => p.MemberId).Distinct().ToList();
        var catalogIds = packages.Select(p => p.PackageId).Distinct().ToList();

        var activeSamePackage = (await db.Set<MemberPackage>()
                .AsNoTracking()
                .Where(mp => memberIds.Contains(mp.MemberId)
                             && catalogIds.Contains(mp.PackageId)
                             && mp.Status == MemberPackageStatus.Active)
                .Select(mp => new { mp.MemberId, mp.PackageId, mp.MemberPackageId })
                .ToListAsync(ct))
            .ToList();

        var today = VietnamTime.TodayLocal(clock);
        var now = clock.UtcNow;
        var startLocal = VietnamTime.ToLocal(session.StartAtUtc);

        var message = replacement is null
            ? $"Buổi học {session.Class!.Name} lúc {startLocal:HH:mm dd/MM/yyyy} đã bị trung tâm hủy. "
              + $"Đăng ký của bạn đã được hủy, lượt tập đã được hoàn lại. "
              + $"Bạn cần chủ động đăng ký buổi khác. Lý do: {reason.Trim()}"
            : $"Buổi học {session.Class!.Name} lúc {startLocal:HH:mm dd/MM/yyyy} đã được dời sang "
              + $"{VietnamTime.ToLocal(replacement.StartAtUtc):HH:mm dd/MM/yyyy}. "
              + $"Đăng ký cũ của bạn đã được hủy và lượt tập đã được hoàn lại — "
              + $"vui lòng đăng ký lại buổi thay thế nếu bạn vẫn tham gia. Lý do: {reason.Trim()}";

        foreach (var enrollment in enrollments)
        {
            enrollment.Status = EnrollmentStatus.CancelledOnTime;
            enrollment.CancelledAt = now;
            enrollment.CancelledByUserId = actorUserId;

            var package = packages.SingleOrDefault(mp => mp.MemberPackageId == enrollment.MemberPackageId);

            if (package is not null)
            {
                // BR-10/BR-11 v1.4 — như nhánh hủy tự nguyện: luôn hoàn lượt, chỉ mở lại gói khi
                // không đụng gói cùng loại đang Active.
                var blockedByStacking = activeSamePackage.Any(
                    other => other.MemberId == package.MemberId
                             && other.PackageId == package.PackageId
                             && other.MemberPackageId != package.MemberPackageId);

                MemberPackageRules.RestoreSession(package, today, blockedByStacking);
            }

            // BR-33 — nội dung phải nêu rõ: đăng ký cũ đã hủy, lượt đã hoàn, cần đăng ký lại,
            // kèm thông tin buổi thay thế nếu có.
            notifications.Queue(new NotificationRequest(
                enrollment.MemberId,
                replacement is null ? NotificationEvents.ClassCancelled : NotificationEvents.ScheduleChanged,
                message,
                replacement?.SessionId ?? session.SessionId));
        }

        return enrollments.Count;
    }

    private async Task NotifyConfirmedMembersAsync(
        Guid sessionId,
        string eventType,
        string message,
        CancellationToken ct)
    {
        var memberIds = await db.Set<Enrollment>()
            .Where(e => e.SessionId == sessionId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => e.MemberId)
            .ToListAsync(ct);

        foreach (var memberId in memberIds)
        {
            notifications.Queue(new NotificationRequest(memberId, eventType, message, sessionId));
        }
    }

    private async Task<ClassSession> BuildSessionAsync(
        Class entity,
        int roomId,
        Guid coachId,
        DateTime startAtUtc,
        DateTime endAtUtc,
        Guid? excludeSessionId,
        CancellationToken ct)
    {
        if (endAtUtc <= startAtUtc)
        {
            throw new BadRequestException("invalid_time_range", "Giờ kết thúc phải sau giờ bắt đầu.");
        }

        if (startAtUtc <= clock.UtcNow)
        {
            throw new BadRequestException("session_in_the_past", "Không tạo buổi học trong quá khứ.");
        }

        var room = await db.Set<Room>().SingleOrDefaultAsync(r => r.RoomId == roomId, ct)
            ?? throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập.");

        var isCoach = await db.Set<UserAccount>()
            .AnyAsync(u => u.UserId == coachId && u.Role!.RoleName == UserRole.Coach, ct);

        if (!isCoach)
        {
            throw new BadRequestException("coach_not_found", "Tài khoản được gán không có vai trò Coach.");
        }

        if (await HasRoomConflictAsync(roomId, startAtUtc, endAtUtc, excludeSessionId, ct))
        {
            throw new ConflictException("room_conflict", "Phòng tập đã có buổi học khác trùng giờ.");
        }

        if (await HasCoachConflictAsync(coachId, startAtUtc, endAtUtc, excludeSessionId, ct))
        {
            throw new ConflictException("coach_conflict", "HLV đã có buổi dạy khác trùng giờ.");
        }

        var baseline = SessionRules.ComputeBaselineCapacity(room.Capacity, entity.Capacity);

        ClassRules.ValidateSessionCapacity(entity.Discipline, baseline);

        return new ClassSession
        {
            SessionId = Guid.NewGuid(),
            ClassId = entity.ClassId,
            RoomId = roomId,
            CoachId = coachId,
            StartAtUtc = startAtUtc,
            EndAtUtc = endAtUtc,
            BaselineCapacity = baseline,
            Capacity = baseline,
            ConfirmedCount = 0,
            Status = ClassSessionStatus.Scheduled
        };
    }

    // Giao nhau nửa mở [start, end): hai buổi liền kề (buổi A kết thúc đúng lúc buổi B bắt đầu)
    // KHÔNG tính là trùng. Chỉ xét buổi Scheduled — buổi đã hủy/đã dời không còn chiếm chỗ.
    private Task<bool> HasRoomConflictAsync(
        int roomId, DateTime startUtc, DateTime endUtc, Guid? excludeSessionId, CancellationToken ct)
        => db.Set<ClassSession>().AnyAsync(
            s => s.RoomId == roomId
                 && s.Status == ClassSessionStatus.Scheduled
                 && s.StartAtUtc < endUtc
                 && startUtc < s.EndAtUtc
                 && (excludeSessionId == null || s.SessionId != excludeSessionId),
            ct);

    private Task<bool> HasCoachConflictAsync(
        Guid coachId, DateTime startUtc, DateTime endUtc, Guid? excludeSessionId, CancellationToken ct)
        => db.Set<ClassSession>().AnyAsync(
            s => s.CoachId == coachId
                 && s.Status == ClassSessionStatus.Scheduled
                 && s.StartAtUtc < endUtc
                 && startUtc < s.EndAtUtc
                 && (excludeSessionId == null || s.SessionId != excludeSessionId),
            ct);

    private static string Describe(ClassSession s)
        => $"{{\"classId\":{s.ClassId},\"roomId\":{s.RoomId},\"coachId\":\"{s.CoachId}\","
           + $"\"startAtUtc\":\"{s.StartAtUtc:O}\",\"endAtUtc\":\"{s.EndAtUtc:O}\","
           + $"\"capacity\":{s.Capacity},\"baselineCapacity\":{s.BaselineCapacity},\"status\":\"{s.Status}\"}}";

    internal static System.Linq.Expressions.Expression<Func<ClassSession, ClassSessionResponse>> Projection()
        => s => new ClassSessionResponse(
            s.SessionId,
            s.ClassId,
            s.Class!.Name,
            s.Class.Discipline,
            s.RoomId,
            s.Room!.Name,
            s.CoachId,
            s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email,
            s.StartAtUtc,
            s.EndAtUtc,
            s.Capacity,
            s.BaselineCapacity,
            s.ConfirmedCount,
            s.Status.ToString(),
            s.RescheduledFromSessionId,
            s.ConfirmedCount >= s.Capacity);
}
