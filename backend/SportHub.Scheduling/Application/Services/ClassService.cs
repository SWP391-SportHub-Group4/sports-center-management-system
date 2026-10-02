using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
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
    IAuditWriter audit,
    IClock clock) : IClassService
{
    public const int MaxPageSize = 100;
    private const string TimeFormat = "HH:mm";

    // ---------------------------------------------------------------- Truy vấn

    public async Task<PagedResult<ClassPublicResponse>> ListPublicAsync(
        int? sportId, int page, int pageSize, CancellationToken ct = default, DateOnly? fromDate = null, DateOnly? toDate = null)
    {
        (page, pageSize) = Normalize(page, pageSize);

        var query = db.Set<Class>().AsNoTracking().Where(c => c.Status == ClassStatus.Published);
        if (sportId is int sid)
        {
            query = query.Where(c => c.SportId == sid);
        }

        if (fromDate.HasValue && toDate.HasValue && fromDate > toDate)
            throw new BadRequestException("invalid_range", "Ngày bắt đầu phải trước ngày kết thúc.");
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
        var row = await Rows(db.Set<Class>().AsNoTracking().Where(c => c.ClassId == classId && c.Status == ClassStatus.Published))
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        return (await ToPublicAsync([row], ct))[0];
    }

    public async Task<PagedResult<ClassManagerResponse>> ListManagerAsync(
        string? status, int? sportId, string? keyword, int page, int pageSize, CancellationToken ct = default)
    {
        (page, pageSize) = Normalize(page, pageSize);

        var query = db.Set<Class>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = SportHub.BuildingBlocks.Api.WireEnum.TryParse<ClassStatus>(status, ignoreCase: true, out var s) && Enum.IsDefined(s)
                ? s
                : throw new BadRequestException("invalid_status", "Trạng thái khóa không hợp lệ.");
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
                  ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        return (await ToManagerAsync([row], ct))[0];
    }

    public async Task<IReadOnlyList<ClassPublicResponse>> ListForCoachAsync(Guid coachId, CancellationToken ct = default)
    {
        var rows = await Rows(db.Set<Class>().AsNoTracking()
            .Where(c => c.CoachId == coachId && c.Status != ClassStatus.Draft && c.Status != ClassStatus.Cancelled)
            .OrderBy(c => c.StartDate).Take(200)).ToListAsync(ct);

        return await ToPublicAsync(rows, ct);
    }

    // ---------------------------------------------------------------- Soạn

    public async Task<ClassManagerResponse> CreateAsync(SaveClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var code = NormalizeCode(request.Code);

        if (await db.Set<Class>().AnyAsync(c => c.Code == code, ct))
        {
            throw new ConflictException("class_code_taken", "Đã có khóa học trùng mã.");
        }

        var entity = new Class
        {
            Status = ClassStatus.Draft,
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
                     ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        // Sau khi publish lịch, phòng, coach, giá đã có ghi danh/giữ chỗ dựa vào: chỉ sửa khi còn Draft.
        // Sửa giá/chi phí trước hạn ngưỡng của khóa đã publish thuộc chặng ngưỡng hoàn vốn.
        if (entity.Status != ClassStatus.Draft)
        {
            throw new ConflictException("class_not_editable", "Chỉ sửa được khóa ở trạng thái Draft.");
        }

        var code = NormalizeCode(request.Code);

        if (await db.Set<Class>().AnyAsync(c => c.Code == code && c.ClassId != classId, ct))
        {
            throw new ConflictException("class_code_taken", "Đã có khóa học trùng mã.");
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
                     ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        if (entity.Status != ClassStatus.Draft)
        {
            throw new ConflictException("class_not_draft", "Chỉ publish được khóa ở trạng thái Draft.");
        }

        if (request.ExpectedVersion is int expected && expected != entity.Version)
        {
            throw new ConflictException("concurrency_conflict", "Khóa học vừa được người khác thay đổi. Vui lòng tải lại.");
        }

        // Kiểm lại toàn bộ điều kiện (môn/phòng/coach có thể đã đổi từ lúc soạn).
        var sport = await validator.RequireGroupCourseSportAsync(entity.SportId, ct);
        var room = await validator.RequireRoomForSportAsync(entity.DefaultRoomId, entity.SportId, ct);

        if (entity.CoachId is not Guid coachId)
        {
            throw new BadRequestException("coach_required", "Phải gán Coach trước khi publish.");
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
            throw new BadRequestException("first_session_in_past", "Buổi đầu đã qua hoặc đang diễn ra — không publish được.");
        }

        var threshold = CourseRules.BreakEvenThreshold(entity.CostAmount, entity.Price);

        if (threshold > entity.Capacity)
        {
            throw new BadRequestException(
                "threshold_exceeds_capacity",
                $"Ngưỡng hoàn vốn ({threshold}) lớn hơn sức chứa ({entity.Capacity}) — khóa không thể hoàn vốn.");
        }

        var thresholdDays = await settings.GetIntAsync(SystemSettingKeys.ClassThresholdDaysBeforeStart, ct);

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
                "Các buổi " + string.Join(", ", closed) + " nằm ngoài giờ mở cửa của phòng (BR-109).");
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
        entity.PublishedAt = now;
        entity.BreakEvenThreshold = threshold;
        entity.ThresholdStatus = ThresholdStatus.NotEvaluated;
        entity.ThresholdDeadlineUtc = first.StartAtUtc.AddDays(-thresholdDays);
        entity.Version++;

        audit.Write(new AuditEntry(actorUserId, "PUBLISH_CLASS", nameof(Class), classId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = ClassStatus.Draft.ToString() }),
            NewValue: JsonSerializer.Serialize(new
            {
                status = ClassStatus.Published.ToString(),
                sessions = sessions.Count,
                breakEvenThreshold = threshold,
                thresholdDeadlineUtc = entity.ThresholdDeadlineUtc
            })));

        notifications.Queue(new NotificationRequest(coachId, NotificationEvents.ClassPublished,
            $"Khóa {entity.Name} đã được mở với {sessions.Count} buổi. Buổi đầu: {VietnamTime.ToLocal(first.StartAtUtc):HH:mm dd/MM/yyyy}."));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetManagerAsync(classId, ct);
    }

    // ---------------------------------------------------------------- Hủy

    public async Task<ClassManagerResponse> CancelAsync(
        int classId, CancelClassRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);

        var entity = await db.Set<Class>().SingleOrDefaultAsync(c => c.ClassId == classId, ct)
                     ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        if (entity.Status is ClassStatus.Cancelled or ClassStatus.Completed)
        {
            throw new ConflictException("class_not_cancellable", "Khóa đã kết thúc hoặc đã bị hủy.");
        }

        // Có ghi danh/giữ chỗ nghĩa là đã có người trả tiền: hủy phải hoàn điểm theo từng ghi danh (chặng ngưỡng hoàn vốn/refund).
        if (entity.ReservedCount > 0 || entity.ConfirmedCount > 0)
        {
            throw new ConflictException(
                "class_has_enrollments",
                "Khóa đã có ghi danh hoặc giữ chỗ — cần hủy qua quy trình hoàn điểm cho học viên.");
        }

        var sessions = await db.Set<ClassSession>()
            .Where(s => s.ClassId == classId && s.Status == ClassSessionStatus.Scheduled)
            .ToListAsync(ct);

        foreach (var s in sessions)
        {
            s.Status = ClassSessionStatus.Cancelled;
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, s.SessionId, ct);
        }

        var previous = entity.Status;
        entity.Status = ClassStatus.Cancelled;
        entity.Version++;

        audit.Write(new AuditEntry(actorUserId, "CANCEL_CLASS", nameof(Class), classId.ToString(),
            OldValue: JsonSerializer.Serialize(new { status = previous.ToString() }),
            NewValue: JsonSerializer.Serialize(new { status = ClassStatus.Cancelled.ToString() }),
            Reason: request.Reason.Trim()));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

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
            throw new BadRequestException("start_date_in_past", "Ngày bắt đầu không được ở quá khứ.");
        }

        var rules = new List<(int DayOfWeek, TimeOnly StartTimeLocal)>();
        foreach (var r in request.ScheduleRules)
        {
            if (!TimeOnly.TryParseExact(r.StartTimeLocal.Trim(), TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
            {
                throw new BadRequestException("invalid_time", "Giờ phải có dạng HH:mm.");
            }

            rules.Add((r.DayOfWeek, time));
        }

        if (rules.Distinct().Count() != rules.Count)
        {
            throw new BadRequestException("duplicate_schedule_rule", "Quy tắc lịch lặp bị trùng.");
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

        return rows.GroupBy(r => r.ClassId).ToDictionary(
            g => g.Key,
            g => (IReadOnlyList<ClassScheduleRuleResponse>)g
                .Select(r => new ClassScheduleRuleResponse(r.DayOfWeek, r.StartTimeLocal.ToString(TimeFormat, CultureInfo.InvariantCulture)))
                .ToList());
    }

    private async Task<IReadOnlyList<ClassPublicResponse>> ToPublicAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var rules = await RulesAsync(rows.Select(r => r.Class.ClassId).ToList(), ct);
        var names = await validator.CoachNamesAsync(rows.Select(r => r.Class.CoachId), ct);

        return rows.Select(r => new ClassPublicResponse(
            r.Class.ClassId, r.Class.Code, r.Class.Name, r.Class.SportId, r.SportName,
            r.Class.CoachId, r.Class.CoachId is Guid id && names.TryGetValue(id, out var n) ? n : null,
            r.Class.DefaultRoomId, r.RoomName, r.Class.StartDate, r.Class.NumSessions,
            r.Class.Capacity, Math.Max(0, r.Class.Capacity - r.Class.ReservedCount), r.Class.Price,
            r.Class.Status.ToString(), r.FirstStart,
            rules.TryGetValue(r.Class.ClassId, out var rl) ? rl : [])).ToList();
    }

    private async Task<IReadOnlyList<ClassManagerResponse>> ToManagerAsync(IReadOnlyList<Row> rows, CancellationToken ct)
    {
        var rules = await RulesAsync(rows.Select(r => r.Class.ClassId).ToList(), ct);
        var names = await validator.CoachNamesAsync(rows.Select(r => r.Class.CoachId), ct);

        return rows.Select(r => new ClassManagerResponse(
            r.Class.ClassId, r.Class.Code, r.Class.Name, r.Class.SportId, r.SportName,
            r.Class.CoachId, r.Class.CoachId is Guid id && names.TryGetValue(id, out var n) ? n : null,
            r.Class.DefaultRoomId, r.RoomName, r.Class.StartDate, r.Class.NumSessions, r.Class.Capacity,
            r.Class.Price, r.Class.CostAmount, r.Class.BreakEvenThreshold,
            r.Class.ThresholdStatus.ToString(), r.Class.ThresholdDeadlineUtc, r.Class.Status.ToString(),
            r.Class.ConfirmedCount, r.Class.ReservedCount, r.ActiveHolds,
            Math.Max(0, r.Class.Capacity - r.Class.ReservedCount),
            r.Class.CreatedByAi, r.Class.Version, r.Class.CreatedAt, r.Class.PublishedAt, r.FirstStart,
            rules.TryGetValue(r.Class.ClassId, out var rl) ? rl : [])).ToList();
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
