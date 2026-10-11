using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

public sealed record CreateClassChangeRequest(Guid RequestId, string Type, string Reason,
    DateTime? ProposedStartAtUtc = null, DateTime? ProposedEndAtUtc = null);
public sealed record ResolveClassChangeRequest(string Type, string ReviewNote, DateTime? StartAtUtc = null,
    int? RoomId = null, Guid? CoachId = null);
public sealed record RejectClassChangeRequest(string ReviewNote);
public sealed record ClassChangeResponse(Guid RequestId, Guid SessionId, int ClassId, string ClassName, int SportId,
    int SessionNo, Guid CoachId, string CoachName, string Type, string Reason, string Status,
    DateTime OriginalStartAtUtc, DateTime OriginalEndAtUtc, int OriginalRoomId,
    DateTime? ProposedStartAtUtc, DateTime? ProposedEndAtUtc, DateTime CreatedAtUtc,
    DateTime? ReviewedAtUtc, string? ReviewNote, string? ResolutionType, Guid? ResultSessionId);

public sealed class ClassSessionChangeRequestService(ISportHubDbContext db, IClassSessionService sessions,
    IUserAccessReader users, INotificationWriter notifications, IAuditWriter audit, IClock clock)
{
    private static bool ValidType(string type) => type is "SUBSTITUTE" or "RESCHEDULE" or "CANCEL_WITH_MAKEUP";
    private static string Reason(string? value) => value?.Trim() is { Length: >= 3 and <= 500 } text ? text
        : throw new BadRequestException("change_reason_required", "Nhập lý do từ 3 đến 500 ký tự.");

    private static Expression<Func<ClassSessionChangeRequest, ClassChangeResponse>> Projection() => r => new(
        r.RequestId, r.SessionId, r.Session.ClassId, r.Session.Class!.Name, r.Session.Class.SportId,
        r.Session.SessionNo, r.RequestedByUserId, r.RequestedBy.Profile == null ? r.RequestedBy.Email : r.RequestedBy.Profile.FullName,
        r.Type, r.Reason, r.Status, r.OriginalStartAtUtc, r.OriginalEndAtUtc, r.OriginalRoomId,
        r.ProposedStartAtUtc, r.ProposedEndAtUtc, r.CreatedAtUtc, r.ReviewedAtUtc, r.ReviewNote, r.ResolutionType, r.ResultSessionId);

    public async Task<object> ListAsync(Guid? coachId, string? status, int? classId, Guid? filterCoachId, Guid? sessionId,
        int page, CancellationToken ct)
    {
        if (page < 1 || page > 10000 || (status != null && status is not ("PENDING" or "RESOLVED" or "REJECTED" or "WITHDRAWN")))
            throw new BadRequestException("change_filter_invalid", "Bộ lọc không hợp lệ.");
        var query = db.Set<ClassSessionChangeRequest>().AsNoTracking();
        if (coachId.HasValue) query = query.Where(r => r.RequestedByUserId == coachId);
        if (status != null) query = query.Where(r => r.Status == status);
        if (classId.HasValue) query = query.Where(r => r.Session.ClassId == classId);
        if (filterCoachId.HasValue) query = query.Where(r => r.RequestedByUserId == filterCoachId);
        if (sessionId.HasValue) query = query.Where(r => r.SessionId == sessionId);
        var totalCount = await query.CountAsync(ct);
        var items = await query.OrderByDescending(r => r.CreatedAtUtc).ThenBy(r => r.RequestId)
            .Skip((page - 1) * 50).Take(50).Select(Projection()).ToListAsync(ct);
        return new { items, page, pageSize = 50, totalCount };
    }

    public async Task<ClassChangeResponse> GetAsync(Guid id, Guid? coachId, CancellationToken ct) =>
        await db.Set<ClassSessionChangeRequest>().AsNoTracking()
            .Where(r => r.RequestId == id && (coachId == null || r.RequestedByUserId == coachId))
            .Select(Projection()).SingleOrDefaultAsync(ct)
        ?? throw new NotFoundException("class_change_not_found", "Không tìm thấy yêu cầu.");

    public async Task<object> FiltersAsync(CancellationToken ct)
    {
        var query = db.Set<ClassSessionChangeRequest>().AsNoTracking();
        var classes = await query.Select(r => new { classId = r.Session.ClassId, name = r.Session.Class!.Name }).Distinct().OrderBy(r => r.name).ToListAsync(ct);
        var coaches = await query.Select(r => new { coachId = r.RequestedByUserId, name = r.RequestedBy.Profile == null ? r.RequestedBy.Email : r.RequestedBy.Profile.FullName }).Distinct().OrderBy(r => r.name).ToListAsync(ct);
        return new { classes, coaches };
    }

    private async Task<ClassSession> LockSessionAsync(Guid sessionId, CancellationToken ct)
    {
        // Same lock order as all group schedule mutations: schedule lock, class, session, request.
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = (SELECT class_id FROM class_sessions WHERE session_id = {sessionId}) FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT session_id FROM class_sessions WHERE session_id = {sessionId} FOR UPDATE", ct);
        return await db.Set<ClassSession>().Include(s => s.Class).SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");
    }

    private void EnsureEditable(ClassSession s)
    {
        if (s.Status != ClassSessionStatus.Scheduled || s.StartAtUtc <= clock.UtcNow || s.Class!.Status is ClassStatus.Draft or ClassStatus.Cancelled or ClassStatus.Completed)
            throw new ConflictException("session_not_editable", "Chỉ yêu cầu thay đổi buổi học chưa bắt đầu, đang có hiệu lực.");
    }

    public async Task<ClassChangeResponse> CreateAsync(Guid sessionId, Guid coachId, CreateClassChangeRequest input, CancellationToken ct)
    {
        var reason = Reason(input.Reason);
        if (input.RequestId == Guid.Empty || !ValidType(input.Type))
            throw new BadRequestException("class_change_invalid", "Loại yêu cầu không hợp lệ.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var s = await LockSessionAsync(sessionId, ct);
        var actor = await users.GetAsync(coachId, ct);
        if (s.CoachId != coachId || actor is not { IsActive: true, Role: "Coach" })
            throw new ForbiddenException("session_not_assigned", "Bạn không được phân công buổi này.");
        var existing = await db.Set<ClassSessionChangeRequest>().SingleOrDefaultAsync(r => r.RequestId == input.RequestId, ct);
        if (existing != null) {
            if (existing.RequestedByUserId != coachId || existing.SessionId != sessionId || existing.Type != input.Type || existing.Reason != reason || existing.ProposedStartAtUtc != input.ProposedStartAtUtc || existing.ProposedEndAtUtc != input.ProposedEndAtUtc)
                throw new ConflictException("change_retry_changed", "Yêu cầu retry khác bản đã lưu.");
            await tx.CommitAsync(ct); return await GetAsync(existing.RequestId, coachId, ct);
        }
        EnsureEditable(s);
        if ((input.ProposedStartAtUtc.HasValue != input.ProposedEndAtUtc.HasValue)
            || (input.ProposedStartAtUtc.HasValue && (input.Type == "SUBSTITUTE" || input.ProposedStartAtUtc.Value.Kind != DateTimeKind.Utc
                || input.ProposedEndAtUtc!.Value.Kind != DateTimeKind.Utc || input.ProposedStartAtUtc <= clock.UtcNow
                || input.ProposedEndAtUtc - input.ProposedStartAtUtc != s.EndAtUtc - s.StartAtUtc)))
            throw new BadRequestException("proposed_time_invalid", "Giờ đề xuất phải ở tương lai và giữ thời lượng buổi học.");
        if (await db.Set<ClassSessionChangeRequest>().AnyAsync(r => r.SessionId == sessionId && r.Status == "PENDING", ct))
            throw new ConflictException("class_change_pending", "Buổi này đã có yêu cầu đang chờ xử lý.");
        var record = new ClassSessionChangeRequest { RequestId = input.RequestId, SessionId = sessionId,
            RequestedByUserId = coachId, Type = input.Type, Reason = reason, ProposedStartAtUtc = input.ProposedStartAtUtc,
            ProposedEndAtUtc = input.ProposedEndAtUtc, OriginalStartAtUtc = s.StartAtUtc, OriginalEndAtUtc = s.EndAtUtc,
            OriginalRoomId = s.RoomId, CreatedAtUtc = clock.UtcNow };
        db.Set<ClassSessionChangeRequest>().Add(record);
        var managers = await db.Set<UserAccount>().Where(u => u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.CenterManager).Select(u => u.UserId).ToListAsync(ct);
        foreach (var id in managers) notifications.Queue(new(id, NotificationEvents.ClassSessionChangeRequested,
            $"{actor.FullName} yêu cầu đổi buổi {s.SessionNo} · {s.Class!.Name}. Lý do: {reason}", record.RequestId));
        WriteAudit(coachId, "CREATE", record);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(record.RequestId, coachId, ct);
    }

    private async Task<(ClassSessionChangeRequest Request, ClassSession Session)> LockRequestAsync(Guid id, Guid? coachId, CancellationToken ct)
    {
        var sessionId = await db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id && (coachId == null || r.RequestedByUserId == coachId))
            .Select(r => (Guid?)r.SessionId).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("class_change_not_found", "Không tìm thấy yêu cầu.");
        var session = await LockSessionAsync(sessionId, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT request_id FROM class_session_change_requests WHERE request_id = {id} FOR UPDATE", ct);
        var record = await db.Set<ClassSessionChangeRequest>().SingleAsync(r => r.RequestId == id, ct);
        if (record.Status != "PENDING") throw new ConflictException("class_change_not_pending", "Yêu cầu đã được xử lý hoặc rút lại.");
        return (record, session);
    }

    public async Task<ClassChangeResponse> WithdrawAsync(Guid id, Guid coachId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (r, _) = await LockRequestAsync(id, coachId, ct);
        r.Status = "WITHDRAWN"; r.ReviewedAtUtc = clock.UtcNow;
        WriteAudit(coachId, "WITHDRAW", r);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(id, coachId, ct);
    }

    public async Task<ClassChangeResponse> ReviewAsync(Guid id, Guid managerId, ResolveClassChangeRequest? input, string? rejection, CancellationToken ct)
    {
        var note = Reason(input?.ReviewNote ?? rejection);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (r, s) = await LockRequestAsync(id, null, ct);
        var actor = await users.GetAsync(managerId, ct);
        if (actor is not { IsActive: true, Role: "CenterManager" } || managerId == r.RequestedByUserId)
            throw new ForbiddenException("manager_required", "Center Manager phải xử lý yêu cầu.");
        if (input != null) {
            EnsureEditable(s);
            if (s.CoachId != r.RequestedByUserId || s.StartAtUtc != r.OriginalStartAtUtc || s.EndAtUtc != r.OriginalEndAtUtc || s.RoomId != r.OriginalRoomId)
                throw new ConflictException("class_change_stale", "Lịch đã thay đổi. Từ chối yêu cầu cũ và kiểm tra lại lịch.");
            if (!ValidType(input.Type) || (input.Type != "SUBSTITUTE" && (!input.StartAtUtc.HasValue || input.StartAtUtc.Value.Kind != DateTimeKind.Utc))
                || (input.Type == "SUBSTITUTE" && (!input.CoachId.HasValue || input.CoachId == s.CoachId)))
                throw new BadRequestException("class_resolution_invalid", "Chọn phương án, coach dạy thay hoặc giờ mới hợp lệ.");
            if (input.Type == "CANCEL_WITH_MAKEUP") {
                var result = await sessions.CancelWithMakeupAsync(s.SessionId, new CancelSessionRequest { Reason = note,
                    Makeup = new() { StartAtUtc = input.StartAtUtc!.Value, RoomId = input.RoomId, CoachId = input.CoachId } }, managerId, ct);
                r.ResultSessionId = result.SessionId;
            } else {
                await sessions.RescheduleAsync(s.SessionId, new RescheduleSessionRequest {
                    StartAtUtc = input.Type == "SUBSTITUTE" ? s.StartAtUtc : input.StartAtUtc!.Value,
                    CoachId = input.CoachId, RoomId = input.Type == "SUBSTITUTE" ? s.RoomId : input.RoomId, Reason = note }, managerId, ct);
                r.ResultSessionId = s.SessionId;
            }
            r.Status = "RESOLVED"; r.ResolutionType = input.Type;
            if (input.CoachId is Guid nextCoach && nextCoach != r.RequestedByUserId)
                await NotifyCoachAsync(nextCoach, NotificationEvents.ScheduleChanged, r.ResultSessionId!.Value, $"Bạn được phân công buổi học · {s.Class!.Name}. {note}", ct);
        } else r.Status = "REJECTED";
        r.ReviewedByUserId = managerId; r.ReviewedAtUtc = clock.UtcNow; r.ReviewNote = note;
        await NotifyCoachAsync(r.RequestedByUserId, NotificationEvents.ClassSessionChangeReviewed, r.RequestId,
            $"Yêu cầu đổi buổi {s.SessionNo} · {s.Class!.Name}: {r.Status}. {note}", ct);
        WriteAudit(managerId, input == null ? "REJECT" : "RESOLVE", r);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await GetAsync(id, null, ct);
    }

    private async Task NotifyCoachAsync(Guid id, string type, Guid source, string message, CancellationToken ct)
    {
        notifications.Queue(new(id, type, message, source));
        var user = await users.GetAsync(id, ct);
        if (user != null) notifications.QueueEmail(new(id, user.Email, type, source, "SportHub · Yêu cầu đổi lịch",
            "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
    }
    private void WriteAudit(Guid actor, string action, ClassSessionChangeRequest r) => audit.Write(new(actor,
        action + "_CLASS_SESSION_CHANGE_REQUEST", nameof(ClassSessionChangeRequest), r.RequestId.ToString(),
        NewValue: JsonSerializer.Serialize(new { r.SessionId, r.Type, r.Status, r.ResolutionType, r.ResultSessionId }), Reason: r.ReviewNote ?? r.Reason));
}
