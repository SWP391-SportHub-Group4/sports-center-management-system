using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Domain.Rules;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Vòng đời khóa học theo môn nhóm: Manager soạn Draft → Publish → (InProgress/Completed do job) hoặc Cancelled.
///
/// Publish là MỘT transaction: khóa dòng lớp, kiểm mọi điều kiện, sinh ĐỦ NumSessions buổi, chiếm phòng + coach cho TẤT CẢ buổi qua
/// occupancy (DB chống trùng), chụp ngưỡng hoàn vốn, chuyển Published. Một buổi xung đột hoặc ngoài giờ mở cửa thì rollback cả publish.
/// Ghi danh KHÔNG sinh từ đây — chỉ từ fulfillment sau thanh toán.
/// </summary>
public sealed class ClassService(
    ISportHubDbContext db,
    CourseValidator validator,
    IOccupancyService occupancy,
    RoomOpeningHourService openingHours,
    ISystemSettingProvider settings,
    INotificationWriter notifications,
    IUserAccessReader users,
    IAuditWriter audit,
    CourseCancellationService cancellations,
    IClock clock) : IClassService
{
    public const int MaxPageSize = 100;
    private const string TimeFormat = "HH:mm";

    // ---------------------------------------------------------------- Truy vấn
    public async Task<ClassManagerResponse> SetEnrollmentOpenAsync(
        int classId,
        bool open,
        Guid actorUserId,
        CancellationToken ct = default,
        string? reason = null)
    {
        var trimmedReason = reason?.Trim();
        // Closing always notifies the enrolled members, so the manager must say why.
        if (!open && trimmedReason is not { Length: >= 3 and <= 500 })
        {
            throw new BadRequestException(
                "enrollment_close_reason_required",
                "Enrollment close reason is required (3-500 characters).");
        }

        await using var tx =
            await db.Database.BeginTransactionAsync(ct);

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE",
            ct);

        var entity = await db.Set<Class>()
            .SingleOrDefaultAsync(
                c => c.ClassId == classId,
                ct)
            ?? throw new NotFoundException(
                "class_not_found",
                "Class not found.");

        if (entity.Status is not (ClassStatus.Published or ClassStatus.InProgress))
        {
            throw new ConflictException(
                "class_not_published",
                "Class not published.");
        }

        if (open && entity.ConfirmedCount >= entity.Capacity)
            throw new ConflictException("class_full", "Enrollment cannot open while the class is full.");

        if (entity.EnrollmentOpen == open)
        {
            await tx.CommitAsync(ct);
            return await GetManagerAsync(classId, ct);
        }

        var before = JsonSerializer.Serialize(new
        {
            enrollmentOpen = entity.EnrollmentOpen,
            reason = entity.EnrollmentClosedReason
        });

        var hadClosureReason = entity.EnrollmentClosedReason;
        entity.EnrollmentOpen = open;
        entity.EnrollmentClosedReason = open ? null : trimmedReason;
        entity.EnrollmentClosedAtUtc = open ? null : clock.UtcNow;
        entity.Version++;

        audit.Write(new AuditEntry(
            actorUserId,
            open
                ? "OPEN_CLASS_ENROLLMENT"
                : "CLOSE_CLASS_ENROLLMENT",
            nameof(Class),
            classId.ToString(),
            OldValue: before,
            NewValue: JsonSerializer.Serialize(new
            {
                enrollmentOpen = open,
                reason = trimmedReason
            }),
            Reason: open ? null : trimmedReason));

        // Closing only stops NEW seat holds. Active holds and enrolled members are untouched; tell the enrolled
        // members why, and tell them again when it is resolved.
        if (!open)
            await NotifyEnrolledAsync(entity, NotificationEvents.ClassEnrollmentClosed,
                $"Enrollment for \"{entity.Name}\" is temporarily closed because of an issue at the center: {trimmedReason} "
                + "Your place and your sessions are unchanged. You can wait for the center to resolve it, or submit a refund request "
                + "from your invoice and the manager will review it as a center-side issue.",
                "SportHub - Course enrollment paused", ct,
                SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(("Class", entity.Name), ("Status", "Enrollment temporarily closed"), ("Reason", trimmedReason!))
                + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph("Your place and your sessions are unchanged.")
                + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph("You can wait for the center to resolve the issue, or submit a refund request from your invoice for the manager to review."));
        else if (open && !string.IsNullOrEmpty(hadClosureReason))
            await NotifyEnrolledAsync(entity, NotificationEvents.ClassEnrollmentReopened,
                $"The issue affecting \"{entity.Name}\" has been resolved and enrollment is open again. Your course continues as normal.",
                "SportHub - Course enrollment reopened", ct,
                SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(("Class", entity.Name), ("Status", "Enrollment reopened"))
                + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph("The issue has been resolved. Your course continues as normal."));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetManagerAsync(classId, ct);
    }

    private async Task NotifyEnrolledAsync(Class course, string eventType, string message, string subject, CancellationToken ct, string? emailBody = null)
    {
        var memberIds = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.ClassId == course.ClassId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => e.MemberId).Distinct().ToListAsync(ct);
        // The inbox keeps one row per (event, recipient, source id), so each close/reopen needs its own id.
        var eventId = Guid.NewGuid();
        foreach (var memberId in memberIds)
        {
            notifications.Queue(new NotificationRequest(memberId, eventType, message, eventId));
            var recipient = await users.GetAsync(memberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(memberId, recipient.Email, eventType, eventId,
                    subject, emailBody ?? SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(message)));
        }
    }

    // ---------------------------------------------------------------- Truy vấn
    public async Task<PagedResult<ClassPublicResponse>> ListPublicAsync(
        int? sportId, int page, int pageSize, CancellationToken ct = default, DateOnly? fromDate = null, DateOnly? toDate = null)
    {
        (page, pageSize) = Normalize(page, pageSize);

        var query = db.Set<Class>().AsNoTracking()
            .Where(c => c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress);
        if (sportId is int sid)
        {
            query = query.Where(c => c.SportId == sid);
        }

        if (fromDate.HasValue && toDate.HasValue && fromDate > toDate)
            throw new BadRequestException("invalid_range", "Invalid range.");
        if (fromDate.HasValue) query = query.Where(c => c.StartDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(c => c.StartDate <= toDate.Value);
        var total = await query.CountAsync(ct);
        var rows = await Rows(query.OrderBy(c => c.Sessions.Where(s => s.Status != ClassSessionStatus.Cancelled)
                .Min(s => (DateTime?)s.StartAtUtc)).ThenBy(c => c.Name)
            .Skip((page - 1) * pageSize).Take(pageSize)).ToListAsync(ct);

        return new PagedResult<ClassPublicResponse>
        {
            Items = await ToPublicAsync(rows, ct),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<ClassPublicResponse> GetPublicAsync(int classId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<Class>().AsNoTracking().Where(c => c.ClassId == classId
                      && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)))
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("class_not_found", "Class not found.");

        return (await ToPublicAsync([row], ct))[0];
    }

    public async Task<PagedResult<ClassManagerResponse>> ListManagerAsync(
        string? status, int? sportId, string? keyword, int page, int pageSize, CancellationToken ct = default, string? thresholdStatus = null, Guid? coachId = null)
    {
        (page, pageSize) = Normalize(page, pageSize);

        var query = db.Set<Class>().AsNoTracking();

        if (coachId is Guid coach) query = query.Where(c => c.CoachId == coach || c.Sessions.Any(s => s.CoachId == coach && s.Status != ClassSessionStatus.Cancelled));

        if (!string.IsNullOrWhiteSpace(thresholdStatus))
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<ThresholdStatus>(thresholdStatus, true, out var threshold) || !Enum.IsDefined(threshold))
                throw new BadRequestException("invalid_threshold_status", "Invalid threshold status.");
            query = query.Where(c => c.ThresholdStatus == threshold);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = SportHub.BuildingBlocks.Api.WireEnum.TryParse<ClassStatus>(status, ignoreCase: true, out var s) && Enum.IsDefined(s)
                ? s
                : throw new BadRequestException("invalid_status", "Invalid status.");
            query = query.Where(c => c.Status == parsed);
        }

        if (sportId is int sid)
        {
            query = query.Where(c => c.SportId == sid);
        }

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(c => c.Name.ToLower().Contains(term) || c.Code.ToLower().Contains(term));
        }

        var total = await query.CountAsync(ct);
        var rows = await Rows(query.OrderByDescending(c => c.CreatedAt).ThenBy(c => c.ClassId)
            .Skip((page - 1) * pageSize).Take(pageSize)).ToListAsync(ct);

        return new PagedResult<ClassManagerResponse>
        {
            Items = await ToManagerAsync(rows, ct),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<ClassManagerResponse> GetManagerAsync(int classId, CancellationToken ct = default)
    {
        var row = await Rows(db.Set<Class>().AsNoTracking().Where(c => c.ClassId == classId)).SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("class_not_found", "Class not found.");

        return (await ToManagerAsync([row], ct))[0];
    }

    public async Task<IReadOnlyList<ClassPublicResponse>> ListForCoachAsync(Guid coachId, CancellationToken ct = default)
    {
        var rows = await Rows(db.Set<Class>().AsNoTracking()
            .Where(c => (c.CoachId == coachId || db.Set<ClassSession>().Any(s => s.ClassId == c.ClassId && s.CoachId == coachId && s.Status != ClassSessionStatus.Cancelled))
                && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress))
            .OrderBy(c => c.StartDate).Take(200)).ToListAsync(ct);

        return await ToPublicAsync(rows, ct);
    }

    // ---------------------------------------------------------------- Soạn

    public async Task<ClassManagerResponse> CreateAsync(SaveClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var code = NormalizeCode(request.Code);

        if (await db.Set<Class>().AnyAsync(c => c.Code == code, ct))
        {
            throw new ConflictException("class_code_taken", "Class code taken.");
        }

        var entity = new Class
        {
            Status = ClassStatus.Draft,
            EnrollmentOpen = false,
            ThresholdStatus = ThresholdStatus.NotEvaluated,
            CreatedAt = clock.UtcNow,
            Version = 1
        };

        var rules = await ApplyAsync(entity, request, code, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        db.Set<Class>().Add(entity);
        await db.SaveChangesAsync(ct); // unique code là nơi chặn thật khi hai request đồng thời

        db.Set<ClassScheduleRule>().AddRange(rules.Select(r => new ClassScheduleRule
        {
            ClassId = entity.ClassId, DayOfWeek = r.DayOfWeek, StartTimeLocal = r.StartTimeLocal
        }));

        audit.Write(new AuditEntry(actorUserId, "CREATE_CLASS", nameof(Class), entity.ClassId.ToString(), NewValue: Describe(entity)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetManagerAsync(entity.ClassId, ct);
    }

    public async Task<ClassManagerResponse> UpdateAsync(
        int classId, SaveClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);

        var entity = await db.Set<Class>().Include(c => c.ScheduleRules).SingleOrDefaultAsync(c => c.ClassId == classId, ct)
                     ?? throw new NotFoundException("class_not_found", "Class not found.");

        // Sau khi publish lịch, phòng, coach, giá đã có ghi danh/giữ chỗ dựa vào: chỉ sửa khi còn Draft.
        // Sửa giá/chi phí trước hạn ngưỡng của khóa đã publish thuộc chặng ngưỡng hoàn vốn.
        if (entity.Status != ClassStatus.Draft)
        {
            throw new ConflictException("class_not_editable", "Class not editable.");
        }

        var code = NormalizeCode(request.Code);

        if (await db.Set<Class>().AnyAsync(c => c.Code == code && c.ClassId != classId, ct))
        {
            throw new ConflictException("class_code_taken", "Class code taken.");
        }

        var before = Describe(entity);
        var rules = await ApplyAsync(entity, request, code, ct);

        db.Set<ClassScheduleRule>().RemoveRange(entity.ScheduleRules);
        await db.SaveChangesAsync(ct);
        db.Set<ClassScheduleRule>().AddRange(rules.Select(r => new ClassScheduleRule
        {
            ClassId = classId, DayOfWeek = r.DayOfWeek, StartTimeLocal = r.StartTimeLocal
        }));

        entity.Version++;
        audit.Write(new AuditEntry(actorUserId, "UPDATE_CLASS", nameof(Class), classId.ToString(),
            OldValue: before, NewValue: Describe(entity)));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetManagerAsync(classId, ct);
    }

    // ---------------------------------------------------------------- Publish

    public async Task<ClassManagerResponse> PublishAsync(
        int classId, PublishClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Khóa dòng lớp: hai Manager publish cùng lúc hoặc publish đua với sửa thì tuần tự hóa.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);

        var entity = await db.Set<Class>().Include(c => c.ScheduleRules).SingleOrDefaultAsync(c => c.ClassId == classId, ct)
                     ?? throw new NotFoundException("class_not_found", "Class not found.");

        if (entity.Status != ClassStatus.Draft)
        {
            throw new ConflictException("class_not_draft", "Class not draft.");
        }

        if (request.ExpectedVersion is int expected && expected != entity.Version)
        {
            throw new ConflictException("concurrency_conflict", "Concurrency conflict.");
        }

        // Kiểm lại toàn bộ điều kiện (môn/phòng/coach có thể đã đổi từ lúc soạn).
        var sport = await validator.RequireGroupCourseSportAsync(entity.SportId, ct);
        var room = await validator.RequireRoomForSportAsync(entity.DefaultRoomId, entity.SportId, ct);

        if (entity.CoachId is not Guid coachId)
        {
            throw new BadRequestException("coach_required", "Coach required.");
        }

        await validator.RequireCoachForSportAsync(coachId, entity.SportId, ct);

        CourseRules.ValidatePrice(entity.Price);
        CourseRules.ValidateCost(entity.CostAmount);
        CourseRules.ValidateNumSessions(entity.NumSessions);
        CourseRules.ValidateCapacity(entity.Capacity, sport.DefaultMaxCapacity, room.Capacity);

        var generated = CourseRules.GenerateSessions(
            entity.StartDate,
            entity.NumSessions,
            entity.ScheduleRules.Select(r => (r.DayOfWeek, r.StartTimeLocal)).ToList(),
            sport.DefaultDurationMinutes);

        var now = clock.UtcNow;
        var first = generated[0];

        if (first.StartAtUtc <= now)
        {
            throw new BadRequestException("first_session_in_past", "First session in past.");
        }

        var threshold = CourseRules.BreakEvenThreshold(entity.CostAmount, entity.Price);

        if (threshold > entity.Capacity)
        {
            throw new BadRequestException(
                "threshold_exceeds_capacity",
                "Threshold exceeds capacity.");
        }

        var thresholdDays = await settings.GetIntAsync(SystemSettingKeys.ClassThresholdDaysBeforeStart, ct);
        var responseHours = await settings.GetIntAsync(SystemSettingKeys.ClassThresholdResponseHours, ct);
        if (responseHours is < 1 or > 48 || thresholdDays < 3 || thresholdDays * 24 < responseHours + 24)
            throw new ConflictException("class_threshold_window_setting_invalid",
                "The threshold review must start at least three days before class and allow the full member response period plus 24 hours for the final decision.");

        // Giờ mở cửa: kiểm mọi buổi trước khi chiếm chỗ để báo lỗi đọc được.
        var closed = new List<int>();
        foreach (var g in generated)
        {
            if (!await openingHours.IsOpenAsync(entity.DefaultRoomId, g.StartAtUtc, g.EndAtUtc, ct))
            {
                closed.Add(g.SessionNo);
            }
        }

        if (closed.Count > 0)
        {
            throw new BadRequestException(
                "session_outside_opening_hours",
                "Session outside opening hours.");
        }

        var sessions = generated.Select(g => new ClassSession
        {
            SessionId = Guid.NewGuid(),
            ClassId = classId,
            SessionNo = g.SessionNo,
            RoomId = entity.DefaultRoomId,
            CoachId = coachId,
            StartAtUtc = g.StartAtUtc,
            EndAtUtc = g.EndAtUtc,
            Status = ClassSessionStatus.Scheduled
        }).ToList();

        db.Set<ClassSession>().AddRange(sessions);
        await db.SaveChangesAsync(ct);

        // Chiếm phòng + coach cho TẤT CẢ buổi; gom mọi xung đột rồi hủy cả publish.
        var conflicts = new List<OccupancyConflict>();
        foreach (var s in sessions)
        {
            var result = await occupancy.ReserveAsync(new OccupancyRequest(
                OccupancySources.ClassSession, s.SessionId, s.RoomId, s.CoachId, s.StartAtUtc, s.EndAtUtc), ct);

            if (!result.Succeeded)
            {
                conflicts.AddRange(result.Conflicts);
            }
        }

        if (conflicts.Count > 0)
        {
            throw new OccupancyConflictException(conflicts);
        }

        entity.Status = ClassStatus.Published;
        entity.EnrollmentOpen = true;
        entity.EnrollmentClosedReason = null;
        entity.EnrollmentClosedAtUtc = null;
        entity.PublishedAt = now;
        entity.BreakEvenThreshold = threshold;
        entity.ThresholdStatus = ThresholdStatus.NotEvaluated;
        // The evaluator runs every five minutes. Start its window ten minutes early so
        // the full response period still ends at least 24 hours before the first session.
        entity.ThresholdDeadlineUtc = first.StartAtUtc.AddDays(-thresholdDays).AddMinutes(-10);
        entity.Version++;

        audit.Write(new AuditEntry(actorUserId, "PUBLISH_CLASS", nameof(Class), classId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = ClassStatus.Draft.ToString() }),
            NewValue: JsonSerializer.Serialize(new
            {
                status = ClassStatus.Published.ToString(),
                enrollmentOpen = true,
                sessions = sessions.Count,
                breakEvenThreshold = threshold,
                thresholdDeadlineUtc = entity.ThresholdDeadlineUtc
            })));

        notifications.Queue(new NotificationRequest(coachId, NotificationEvents.ClassPublished,
            $"Course {entity.Name} is open with {sessions.Count} sessions. First session: {VietnamTime.ToLocal(first.StartAtUtc):HH:mm dd/MM/yyyy}."));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetManagerAsync(classId, ct);
    }

    // ---------------------------------------------------------------- Hủy

    public async Task<ClassManagerResponse> CancelAsync(
        int classId, CancelClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await cancellations.CancelAsync(classId, request, actorUserId, ct);
        return await GetManagerAsync(classId, ct);
    }
    // ---------------------------------------------------------------- Nội bộ

    private async Task<List<(int DayOfWeek, TimeOnly StartTimeLocal)>> ApplyAsync(
        Class entity, SaveClassRequest request, string code, CancellationToken ct)
    {
        var sport = await validator.RequireGroupCourseSportAsync(request.SportId, ct);
        var room = await validator.RequireRoomForSportAsync(request.DefaultRoomId, request.SportId, ct);

        if (request.CoachId is Guid coachId)
        {
            await validator.RequireCoachForSportAsync(coachId, request.SportId, ct);
        }

        CourseRules.ValidatePrice(request.Price);
        CourseRules.ValidateCost(request.CostAmount);
        CourseRules.ValidateNumSessions(request.NumSessions);
        CourseRules.ValidateCapacity(request.Capacity, sport.DefaultMaxCapacity, room.Capacity);

        if (request.StartDate < VietnamTime.TodayLocal(clock))
        {
            throw new BadRequestException("start_date_in_past", "Start date in past.");
        }

        var rules = new List<(int DayOfWeek, TimeOnly StartTimeLocal)>();
        foreach (var r in request.ScheduleRules)
        {
            if (!TimeOnly.TryParseExact(r.StartTimeLocal.Trim(), TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
            {
                throw new BadRequestException("invalid_time", "Invalid time.");
            }

            rules.Add((r.DayOfWeek, time));
        }

        if (rules.Distinct().Count() != rules.Count)
        {
            throw new BadRequestException("duplicate_schedule_rule", "Duplicate schedule rule.");
        }

        // Chạy thử bộ sinh lịch để báo sớm lỗi ngày bắt đầu lệch lịch lặp.
        CourseRules.GenerateSessions(request.StartDate, request.NumSessions, rules, Math.Max(sport.DefaultDurationMinutes, 1));

        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.SportId = request.SportId;
        entity.CoachId = request.CoachId;
        entity.DefaultRoomId = request.DefaultRoomId;
        entity.StartDate = request.StartDate;
        entity.NumSessions = request.NumSessions;
        entity.Capacity = request.Capacity;
        entity.Price = request.Price;
        entity.CostAmount = request.CostAmount;

        return rules;
    }

    private static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    private static (int Page, int PageSize) Normalize(int page, int pageSize)
        => (page < 1 ? 1 : page, Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, MaxPageSize));

    private sealed record Row(Class Class, string SportName, string RoomName, DateTime? FirstStart, int ActiveHolds);

    private IQueryable<Row> Rows(IQueryable<Class> classes)
        => classes.Select(c => new Row(
                c,
                c.Sport!.Name,
                c.DefaultRoom!.Name,
                c.Sessions.Where(s => s.Status != ClassSessionStatus.Cancelled).Min(s => (DateTime?)s.StartAtUtc),
                db.Set<SeatHold>().Count(h => h.ClassId == c.ClassId && h.Status == SeatHoldStatus.Active)));

    private async Task<IReadOnlyDictionary<int, IReadOnlyList<ClassScheduleRuleResponse>>> RulesAsync(
        IReadOnlyCollection<int> classIds, CancellationToken ct)
    {
        var rows = await db.Set<ClassScheduleRule>().AsNoTracking()
            .Where(r => classIds.Contains(r.ClassId))
            .OrderBy(r => r.DayOfWeek).ThenBy(r => r.StartTimeLocal)
            .ToListAsync(ct);

        // Thời lượng buổi lấy từ buổi đã sinh (Draft chưa có buổi → không có giờ kết thúc).
        var sessions = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => classIds.Contains(s.ClassId) && s.Status != ClassSessionStatus.Cancelled)
            .GroupBy(s => s.ClassId)
            .Select(g => new { ClassId = g.Key, Start = g.Min(s => s.StartAtUtc), End = g.Min(s => s.EndAtUtc) })
            .ToListAsync(ct);
        var minutes = sessions.ToDictionary(s => s.ClassId, s => (int)Math.Round((s.End - s.Start).TotalMinutes));

        return rows.GroupBy(r => r.ClassId).ToDictionary(
            g => g.Key,
            g => (IReadOnlyList<ClassScheduleRuleResponse>)g
                .Select(r => new ClassScheduleRuleResponse(
                    r.DayOfWeek,
                    r.StartTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture),
                    minutes.TryGetValue(r.ClassId, out var m) && m > 0
                        ? r.StartTimeLocal.AddMinutes(m).ToString(TimeFormat, CultureInfo.InvariantCulture)
                        : null))
                .ToList());
    }

    private async Task<IReadOnlyList<ClassPublicResponse>> ToPublicAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var rules = await RulesAsync(rows.Select(r => r.Class.ClassId).ToList(), ct);
        var names = await validator.CoachNamesAsync(rows.Select(r => r.Class.CoachId), ct);
        var now = clock.UtcNow;
        var classIds = rows.Select(r => r.Class.ClassId).ToList();
        // Tiến độ khóa cho Member vào giữa chừng: buổi đã bắt đầu / buổi còn lại (không tính buổi bị hủy).
        var progress = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => classIds.Contains(s.ClassId) && s.Status != ClassSessionStatus.Cancelled)
            .GroupBy(s => s.ClassId)
            .Select(g => new
            {
                ClassId = g.Key,
                Passed = g.Count(s => s.StartAtUtc <= now),
                Remaining = g.Count(s => s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > now)
            })
            .ToDictionaryAsync(x => x.ClassId, ct);

        return rows.Select(r => new ClassPublicResponse(
            r.Class.ClassId,
            r.Class.Code,
            r.Class.Name,
            r.Class.SportId,
            r.SportName,
            r.Class.CoachId,
            r.Class.CoachId is Guid id && names.TryGetValue(id, out var n) ? n : null,
            r.Class.DefaultRoomId,
            r.RoomName,
            r.Class.StartDate,
            r.Class.NumSessions,
            r.Class.Capacity,
            Math.Max(0, r.Class.Capacity - r.Class.ReservedCount),
            r.Class.Price,
            r.Class.Status.ToString(),
            r.Class.EnrollmentOpen && r.Class.Status == ClassStatus.Published && r.Class.ConfirmedCount < r.Class.Capacity && r.FirstStart > now && !(r.Class.ThresholdStatus == ThresholdStatus.AtRisk
                && r.Class.ThresholdResponseDeadlineUtc <= now),
            r.Class.ThresholdStatus == ThresholdStatus.AtRisk
                && r.Class.ThresholdResponseDeadlineUtc <= now,
            r.FirstStart,
            rules.TryGetValue(r.Class.ClassId, out var rl) ? rl : [],
            r.Class.ThresholdStatus is ThresholdStatus.Met or ThresholdStatus.WaivedByManager
                || r.Class.Status is ClassStatus.InProgress or ClassStatus.Completed,
            progress.TryGetValue(r.Class.ClassId, out var p) ? p.Passed : 0,
            progress.TryGetValue(r.Class.ClassId, out var p2) ? p2.Remaining : 0
        )).ToList();
    }

    private async Task<IReadOnlyList<ClassManagerResponse>> ToManagerAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var rules = await RulesAsync(rows.Select(r => r.Class.ClassId).ToList(), ct);
        var names = await validator.CoachNamesAsync(rows.Select(r => r.Class.CoachId), ct);

        return rows.Select(r => new ClassManagerResponse(
            r.Class.ClassId,
            r.Class.Code,
            r.Class.Name,
            r.Class.SportId,
            r.SportName,
            r.Class.CoachId,
            r.Class.CoachId is Guid id && names.TryGetValue(id, out var n) ? n : null,
            r.Class.DefaultRoomId,
            r.RoomName,
            r.Class.StartDate,
            r.Class.NumSessions,
            r.Class.Capacity,
            r.Class.Price,
            r.Class.CostAmount,
            r.Class.BreakEvenThreshold,
            r.Class.ThresholdStatus.ToString(),
            r.Class.ThresholdDeadlineUtc,
            r.Class.ThresholdResponseDeadlineUtc,
            r.Class.Status.ToString(),
            r.Class.ConfirmedCount,
            r.Class.ReservedCount,
            r.ActiveHolds,
            Math.Max(0, r.Class.Capacity - r.Class.ReservedCount),
            r.Class.CreatedByAi,
            r.Class.EnrollmentOpen && r.Class.Status == ClassStatus.Published && r.Class.ConfirmedCount < r.Class.Capacity && r.FirstStart > clock.UtcNow,
            r.Class.EnrollmentClosedReason,
            r.Class.EnrollmentClosedAtUtc,
            r.Class.Version,
            r.Class.CreatedAt,
            r.Class.PublishedAt,
            r.FirstStart,
            rules.TryGetValue(r.Class.ClassId, out var rl) ? rl : []
        )).ToList();
    }

    private static string Describe(Class c)
        => JsonSerializer.Serialize(new
        {
            code = c.Code,
            name = c.Name,
            sportId = c.SportId,
            coachId = c.CoachId,
            roomId = c.DefaultRoomId,
            startDate = c.StartDate,
            numSessions = c.NumSessions,
            capacity = c.Capacity,
            price = c.Price,
            costAmount = c.CostAmount,
            status = c.Status.ToString()
        });
}
