using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Services;

public interface IClassService
{
    Task<IReadOnlyList<ClassDto>> GetAllAsync(string? discipline, bool includeArchived, CancellationToken ct = default);

    Task<ClassDto> GetAsync(int classId, CancellationToken ct = default);

    Task<ClassDto> CreateAsync(SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassDto> UpdateAsync(int classId, SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassDto> SetStatusAsync(int classId, ClassStatus status, Guid actorUserId, CancellationToken ct = default);

    Task<ClassDto> AddRecurrenceAsync(int classId, SaveRecurrenceRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassDto> DeleteRecurrenceAsync(int classId, int recurrenceId, Guid actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Lớp học và mẫu lịch lặp — BR-12 (phải có Phòng + Bộ môn), BR-14 (chỉ Manager phân công HLV),
/// BR-15 (session thừa hưởng khung giờ từ recurrence).
/// </summary>
public sealed class ClassService(ISportHubDbContext db, IAuditWriter audit) : IClassService
{
    /// <summary>Thứ trong tuần dùng ở ClassRecurrence.DaysOfWeek, vd "MON,WED,FRI".</summary>
    public static readonly IReadOnlyDictionary<string, DayOfWeek> DayCodes =
        new Dictionary<string, DayOfWeek>(StringComparer.OrdinalIgnoreCase)
        {
            ["MON"] = DayOfWeek.Monday,
            ["TUE"] = DayOfWeek.Tuesday,
            ["WED"] = DayOfWeek.Wednesday,
            ["THU"] = DayOfWeek.Thursday,
            ["FRI"] = DayOfWeek.Friday,
            ["SAT"] = DayOfWeek.Saturday,
            ["SUN"] = DayOfWeek.Sunday
        };

    public const string VietnamTimezoneId = "Asia/Ho_Chi_Minh";

    public async Task<IReadOnlyList<ClassDto>> GetAllAsync(
        string? discipline,
        bool includeArchived,
        CancellationToken ct = default)
    {
        var query = db.Set<Class>().AsNoTracking();

        if (!includeArchived)
        {
            query = query.Where(c => c.Status == ClassStatus.Active);
        }

        if (!string.IsNullOrWhiteSpace(discipline))
        {
            query = query.Where(c => c.Discipline == discipline);
        }

        return await query.OrderBy(c => c.Name).Select(Projection()).ToListAsync(ct);
    }

    public async Task<ClassDto> GetAsync(int classId, CancellationToken ct = default)
        => await db.Set<Class>().AsNoTracking().Where(c => c.ClassId == classId).Select(Projection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

    public async Task<ClassDto> CreateAsync(
        SaveClassRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        // BR-12 + ràng buộc bộ môn/sức chứa PT (SSOT §1.1). ClassRules cũng là nơi DB CHECK
        // constraint soi lại, nhưng gọi ở đây để client nhận lỗi đọc được thay vì 23514.
        ClassRules.ValidateClass(request.Discipline, request.Capacity);

        await EnsureRoomExistsAsync(request.DefaultRoomId, ct);
        await EnsureCoachAsync(request.DefaultCoachId, ct);

        var entity = new Class
        {
            Name = request.Name.Trim(),
            Discipline = request.Discipline,
            DefaultRoomId = request.DefaultRoomId,
            DefaultCoachId = request.DefaultCoachId,
            Capacity = request.Capacity,
            Status = ClassStatus.Active
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<Class>().Add(entity);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_CLASS", nameof(Class), entity.ClassId.ToString(), NewValue: Describe(entity)));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(entity.ClassId, ct);
    }

    public async Task<ClassDto> UpdateAsync(
        int classId,
        SaveClassRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var entity = await db.Set<Class>().SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

        ClassRules.ValidateClass(request.Discipline, request.Capacity);
        await EnsureRoomExistsAsync(request.DefaultRoomId, ct);
        await EnsureCoachAsync(request.DefaultCoachId, ct);

        var before = Describe(entity);

        entity.Name = request.Name.Trim();
        entity.Discipline = request.Discipline;
        entity.DefaultRoomId = request.DefaultRoomId;

        // BR-14 — phân công/phân công lại HLV: endpoint này chỉ Center Manager gọi được.
        // Đổi ở đây chỉ ảnh hưởng buổi sinh SAU; buổi đã tạo giữ CoachId của nó
        // (đổi HLV cho một buổi cụ thể dùng PUT /api/class-sessions/{id}).
        entity.DefaultCoachId = request.DefaultCoachId;
        entity.Capacity = request.Capacity;

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_CLASS", nameof(Class), classId.ToString(),
            OldValue: before, NewValue: Describe(entity)));

        await db.SaveChangesAsync(ct);

        return await GetAsync(classId, ct);
    }

    public async Task<ClassDto> SetStatusAsync(
        int classId,
        ClassStatus status,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var entity = await db.Set<Class>().SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

        var previous = entity.Status;
        entity.Status = status;

        // Archive KHÔNG tự huỷ các buổi đã lên lịch: huỷ buổi kéo theo hoàn lượt và thông báo
        // cho từng hội viên (BR-54), đó là thao tác riêng và phải có lý do riêng.
        audit.Write(new AuditEntry(
            actorUserId,
            status == ClassStatus.Archived ? "ARCHIVE_CLASS" : "REACTIVATE_CLASS",
            nameof(Class), classId.ToString(),
            OldValue: $"{{\"status\":\"{previous}\"}}", NewValue: $"{{\"status\":\"{status}\"}}"));

        await db.SaveChangesAsync(ct);

        return await GetAsync(classId, ct);
    }

    public async Task<ClassDto> AddRecurrenceAsync(
        int classId,
        SaveRecurrenceRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        _ = await db.Set<Class>().SingleOrDefaultAsync(c => c.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy lớp học.");

        var days = NormalizeDays(request.DaysOfWeek);

        if (request.EndTimeLocal <= request.StartTimeLocal)
        {
            throw new BadRequestException(
                "invalid_time_range", "Giờ kết thúc phải sau giờ bắt đầu (không hỗ trợ buổi qua đêm).");
        }

        if (request.EffectiveTo is not null && request.EffectiveTo < request.EffectiveFrom)
        {
            throw new BadRequestException("invalid_date_range", "Ngày kết thúc hiệu lực phải sau ngày bắt đầu.");
        }

        var recurrence = new ClassRecurrence
        {
            ClassId = classId,
            DaysOfWeek = days,
            StartTimeLocal = request.StartTimeLocal,
            EndTimeLocal = request.EndTimeLocal,

            // Giờ trong recurrence là GIỜ ĐỊA PHƯƠNG (SSOT §5.3); quy đổi sang UTC xảy ra khi
            // sinh ClassSession. Lưu kèm timezone để về sau đọc lại không phải đoán.
            Timezone = VietnamTimezoneId,
            EffectiveFrom = request.EffectiveFrom,
            EffectiveTo = request.EffectiveTo
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<ClassRecurrence>().Add(recurrence);
        await db.SaveChangesAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "ADD_CLASS_RECURRENCE", nameof(ClassRecurrence), recurrence.RecurrenceId.ToString(),
            NewValue: $"{{\"classId\":{classId},\"daysOfWeek\":\"{days}\","
                      + $"\"start\":\"{request.StartTimeLocal}\",\"end\":\"{request.EndTimeLocal}\"}}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(classId, ct);
    }

    public async Task<ClassDto> DeleteRecurrenceAsync(
        int classId,
        int recurrenceId,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var recurrence = await db.Set<ClassRecurrence>()
            .SingleOrDefaultAsync(r => r.RecurrenceId == recurrenceId && r.ClassId == classId, ct)
            ?? throw new NotFoundException("recurrence_not_found", "Không tìm thấy mẫu lịch lặp.");

        // Buổi đã sinh từ mẫu này KHÔNG bị xoá theo: người đã đăng ký vẫn phải đến học.
        // Tách RecurrenceId ra null để buổi cũ đứng độc lập (field vốn nullable, SSOT §2).
        await db.Set<ClassSession>()
            .Where(s => s.RecurrenceId == recurrenceId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RecurrenceId, (int?)null), ct);

        db.Set<ClassRecurrence>().Remove(recurrence);

        audit.Write(new AuditEntry(
            actorUserId, "DELETE_CLASS_RECURRENCE", nameof(ClassRecurrence), recurrenceId.ToString(),
            OldValue: $"{{\"classId\":{classId},\"daysOfWeek\":\"{recurrence.DaysOfWeek}\"}}"));

        await db.SaveChangesAsync(ct);

        return await GetAsync(classId, ct);
    }

    /// <summary>Chuẩn hoá "mon, wed" thành "MON,WED"; ném nếu có mã thứ không hợp lệ.</summary>
    public static string NormalizeDays(string daysOfWeek)
    {
        var parts = daysOfWeek
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => p.ToUpperInvariant())
            .Distinct()
            .ToList();

        if (parts.Count == 0)
        {
            throw new BadRequestException("invalid_days_of_week", "Phải chọn ít nhất một ngày trong tuần.");
        }

        var invalid = parts.Where(p => !DayCodes.ContainsKey(p)).ToList();

        if (invalid.Count > 0)
        {
            throw new BadRequestException(
                "invalid_days_of_week",
                $"Mã thứ không hợp lệ: {string.Join(", ", invalid)}. Hợp lệ: MON, TUE, WED, THU, FRI, SAT, SUN.");
        }

        // Sắp theo thứ tự trong tuần để chuỗi lưu trong DB ổn định, không phụ thuộc thứ tự người nhập.
        return string.Join(',', parts.OrderBy(p => (int)DayCodes[p]));
    }

    private async Task EnsureRoomExistsAsync(int roomId, CancellationToken ct)
    {
        if (!await db.Set<Room>().AnyAsync(r => r.RoomId == roomId, ct))
        {
            throw new NotFoundException("room_not_found", "Không tìm thấy phòng tập được gán (BR-12).");
        }
    }

    private async Task EnsureCoachAsync(Guid? coachId, CancellationToken ct)
    {
        if (coachId is null)
        {
            return;
        }

        var isCoach = await db.Set<UserAccount>()
            .AnyAsync(u => u.UserId == coachId && u.Role!.RoleName == UserRole.Coach, ct);

        if (!isCoach)
        {
            throw new BadRequestException(
                "coach_not_found", "Tài khoản được gán làm HLV không tồn tại hoặc không có vai trò Coach.");
        }
    }

    private static string Describe(Class c)
        => $"{{\"name\":{System.Text.Json.JsonSerializer.Serialize(c.Name)},\"discipline\":\"{c.Discipline}\","
           + $"\"roomId\":{c.DefaultRoomId},\"coachId\":{(c.DefaultCoachId is null ? "null" : $"\"{c.DefaultCoachId}\"")},"
           + $"\"capacity\":{c.Capacity},\"status\":\"{c.Status}\"}}";

    private static System.Linq.Expressions.Expression<Func<Class, ClassDto>> Projection()
        => c => new ClassDto(
            c.ClassId,
            c.Name,
            c.Discipline,
            c.DefaultRoomId,
            c.DefaultRoom!.Name,
            c.DefaultRoom.Capacity,
            c.DefaultCoachId,
            c.DefaultCoach == null
                ? null
                : c.DefaultCoach.Profile != null ? c.DefaultCoach.Profile.FullName : c.DefaultCoach.Email,
            c.Capacity,
            c.Status.ToString(),
            c.Recurrences
                .OrderBy(r => r.StartTimeLocal)
                .Select(r => new ClassRecurrenceDto(
                    r.RecurrenceId, r.DaysOfWeek, r.StartTimeLocal, r.EndTimeLocal,
                    r.Timezone, r.EffectiveFrom, r.EffectiveTo))
                .ToList());
}
