using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Xếp lịch/hủy/dời lịch/hoàn thành/no-show buổi PT — BE-4 §6. Manager tạo/cancel/reschedule
/// trực tiếp; PersonalTrainer chỉ complete/no-show buổi của chính mình; Member chỉ đọc + gửi
/// change request (<see cref="PtSessionChangeRequestService"/> gọi lại <see cref="ApplyCancelAsync"/>/
/// <see cref="ApplyRescheduleAsync"/> ở đây khi Manager duyệt, dùng TimingClassification đã lưu
/// từ lúc Member gửi yêu cầu — không tính lại tại lúc duyệt, theo đúng BE-4 §5.3).
///
/// Không có exclusion constraint (btree_gist) chặn overlap ở DB trong migration này (xem
/// PtSessionConfiguration) — dùng transaction + Postgres advisory lock theo Coach/Member để bịt
/// khe race, thay vì chỉ AnyAsync không khoá.
/// </summary>
public sealed partial class PtSessionService(
    ISportHubDbContext db,
    IAuditWriter audit,
    INotificationWriter notifications,
    IOccupancyService occupancy,
    ISportCatalogReader catalog,
    ICoachSpecialtyReader specialties,
    IUserAccessReader users,
    ISchedulingAvailabilityReader availability,
    IClock clock) : IPtSessionService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;
    public const int MaximumSearchRangeDays = 366;

    public async Task<IReadOnlyList<PtSessionResponse>> SearchAsync(
        Guid? memberId,
        Guid? coachId,
        string? status,
        DateTime? fromUtc,
        DateTime? toUtc,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        if (fromUtc is not null && toUtc is not null && fromUtc > toUtc)
        {
            throw new BadRequestException("invalid_pt_session_range", "Thời điểm bắt đầu phải trước thời điểm kết thúc.");
        }
        if (fromUtc is not null && toUtc is not null
            && toUtc.Value - fromUtc.Value > TimeSpan.FromDays(MaximumSearchRangeDays))
        {
            throw new BadRequestException(
                "range_too_large", $"Khoảng lịch PT tối đa {MaximumSearchRangeDays} ngày.");
        }

        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize);
        var query = db.Set<PtSession>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(s => s.MemberId == memberId);
        }

        if (coachId is not null)
        {
            query = query.Where(s => s.CoachId == coachId);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PtSessionStatus>(status, ignoreCase: true, out var parsed))
            {
                throw new BadRequestException("pt_session_not_found", $"Trạng thái '{status}' không hợp lệ.");
            }

            query = query.Where(s => s.Status == parsed);
        }

        if (fromUtc is not null)
        {
            query = query.Where(s => s.EndAtUtc > fromUtc);
        }

        if (toUtc is not null)
        {
            query = query.Where(s => s.StartAtUtc < toUtc);
        }

        return await query.OrderBy(s => s.StartAtUtc).ThenBy(s => s.SessionId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(Projection()).ToListAsync(ct);
    }

    public async Task<PtSessionResponse> GetAsync(Guid sessionId, CancellationToken ct = default)
        => await db.Set<PtSession>().AsNoTracking()
               .Where(s => s.SessionId == sessionId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("pt_session_not_found", "Không tìm thấy buổi PT.");

    public async Task<PtSessionResponse> CreateAsync(
        CreatePtSessionRequest request, Guid managerId, CancellationToken ct = default)
    {
        var entitlementPreview = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(e => e.EntitlementId == request.EntitlementId)
            .Select(e => new { e.CoachId, e.MemberId })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await LockCoachAndMemberAsync(entitlementPreview.CoachId, entitlementPreview.MemberId, ct);

        var entitlement = await LockEntitlementAsync(request.EntitlementId, ct);

        if (entitlement.CoachId != entitlementPreview.CoachId
            || entitlement.MemberId != entitlementPreview.MemberId)
        {
            throw new ConflictException(
                "pt_session_assignment_changed",
                "Phân công PT vừa thay đổi; vui lòng tải lại và thử xếp lịch lại.");
        }

        EnsureActiveWithQuota(entitlement);

        var startAtUtc = request.StartAtUtc;
        var endAtUtc = PtSessionRules.EndAtUtc(startAtUtc);

        EnsureWithinValidity(entitlement, startAtUtc, endAtUtc);

        await EnsureNoConflictAsync(
            entitlement.CoachId, entitlement.MemberId, startAtUtc, endAtUtc, excludeSessionId: null, ct);

        if (request.RoomId is int requestedRoom)
        {
            await PtRoomValidator.RequireAsync(catalog, specialties, requestedRoom, entitlement.CoachId, startAtUtc, endAtUtc, ct);
        }

        var session = await PersistNewSessionAsync(
            entitlement, startAtUtc, endAtUtc, request.RoomId, managerId, "CREATE_PT_SESSION", ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(session.SessionId, ct);
    }

    /// <summary>
    /// Giữ quota, tạo buổi và chiếm lịch Coach (và phòng nếu có). Gọi trong transaction đã khoá Coach/Member/quyền lợi;
    /// dùng chung cho Manager xếp lịch và Member tự đặt để hai đường không lệch quy tắc.
    /// </summary>
    private async Task<PtSession> PersistNewSessionAsync(
        PtEntitlement entitlement, DateTime startAtUtc, DateTime endAtUtc, int? roomId,
        Guid actorUserId, string auditAction, CancellationToken ct, PtSessionStatus status = PtSessionStatus.Scheduled)
    {
        entitlement.ReservedSessions += 1;
        entitlement.Version += 1;

        var session = new PtSession
        {
            SessionId = Guid.NewGuid(),
            EntitlementId = entitlement.EntitlementId,
            MemberId = entitlement.MemberId,
            CoachId = entitlement.CoachId,
            RoomId = roomId,
            StartAtUtc = startAtUtc,
            EndAtUtc = endAtUtc,
            Status = status,
            QuotaState = PtSessionQuotaState.Reserved,
            CreatedByUserId = actorUserId,
            Version = 0
        };

        db.Set<PtSession>().Add(session);

        // Coach luôn bị chiếm lịch (bất kể lớp/thuê sân/PT khác); phòng chỉ khi buổi có phòng. DB chặn trùng thật.
        await ReserveOccupancyAsync(session, ct);

        audit.Write(new AuditEntry(
            actorUserId, auditAction, nameof(PtSession), session.SessionId.ToString(),
            NewValue: $"{{\"entitlementId\":\"{entitlement.EntitlementId}\",\"startAtUtc\":\"{startAtUtc:O}\"}}"));

        return session;
    }

    /// <summary>Khung PT còn trống của Coach được giao cho quyền lợi này, trong khoảng ngày địa phương [fromDate, toDate].</summary>
    public async Task<PtAvailabilityResponse> GetSelfBookingAvailabilityAsync(
        Guid memberId, Guid entitlementId, DateOnly fromDate, DateOnly toDate, CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            throw new BadRequestException("invalid_availability_range", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        }

        if (toDate.DayNumber - fromDate.DayNumber + 1 > PtSessionRules.MaxAvailabilityRangeDays)
        {
            throw new BadRequestException(
                "range_too_large", $"Mỗi lần xem tối đa {PtSessionRules.MaxAvailabilityRangeDays} ngày.");
        }

        var entitlement = await db.Set<PtEntitlement>().AsNoTracking()
            .SingleOrDefaultAsync(e => e.EntitlementId == entitlementId && e.MemberId == memberId, ct)
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");

        var coachName = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(e => e.EntitlementId == entitlementId)
            .Select(e => e.Coach!.Profile != null ? e.Coach.Profile.FullName : e.Coach.Email)
            .SingleAsync(ct);
        var remaining = Math.Max(0, entitlement.TotalQuota - entitlement.ReservedSessions - entitlement.ConsumedSessions);
        var policy = new PtBookingPolicy(
            PtSessionRules.SelfBookMinLeadHours, PtSessionRules.SelfBookMaxAdvanceDays,
            PtSessionRules.SlotStepMinutes, PtSessionRules.ChangeDeadlineHours);

        string? reason = null;
        if (entitlement.Status != PtEntitlementStatus.Active)
        {
            reason = "pt_entitlement_not_active";
        }
        else if (remaining <= 0)
        {
            reason = "pt_quota_exhausted";
        }
        else if (!await HasActiveRelationshipAsync(entitlement.MemberId, entitlement.CoachId, ct))
        {
            reason = "pt_relationship_required";
        }

        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var rooms = await availability.GetServiceRoomsAsync(SportServiceType.PersonalTraining, fromUtc, toUtc, ct);

        if (reason is null && rooms.Count == 0)
        {
            reason = "pt_no_room_configured";
        }

        IReadOnlyList<PtSlot> slots = [];
        if (reason is null)
        {
            var coachBusy = await availability.GetCoachBusyAsync(entitlement.CoachId, fromUtc, toUtc, ct);
            var memberBusy = await db.Set<PtSession>().AsNoTracking()
                .Where(s => s.MemberId == memberId && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.PendingPayment)
                            && s.StartAtUtc < toUtc && s.EndAtUtc > fromUtc)
                .Select(s => new TimeWindow(s.StartAtUtc, s.EndAtUtc))
                .ToListAsync(ct);

            slots = PtSlotCalculator.Compute(
                clock.UtcNow, fromDate, toDate, rooms, coachBusy, memberBusy,
                VietnamTime.StartOfDayUtc(entitlement.ValidityStartDate),
                VietnamTime.EndOfDayExclusiveUtc(entitlement.ValidityEndDate));
        }

        return new PtAvailabilityResponse(
            entitlementId, entitlement.CoachId, coachName, PtSessionRules.SessionDurationMinutes, remaining, reason, policy,
            slots.Select(slot => new PtAvailabilitySlot(
                slot.StartAtUtc, slot.EndAtUtc, slot.Rooms.Select(room => new PtAvailabilityRoom(room.RoomId, room.Name)).ToList()))
                .ToList());
    }

    /// <summary>
    /// Member tự đặt buổi PT. Cùng khoá, quota, hiệu lực và chống trùng như Manager xếp lịch, cộng thêm: quyền lợi phải của
    /// chính Member, có quan hệ Coach–Member đang hoạt động, giờ trên lưới 30 phút, báo trước tối thiểu và đặt trước tối đa,
    /// và phòng PT trống (tự gán nếu không chọn). Đặt trùng giờ sẽ nhận 409 nên gửi lại cùng yêu cầu là an toàn.
    /// </summary>
    public async Task<PtSessionResponse> SelfBookAsync(
        Guid memberId, SelfBookPtSessionRequest request, CancellationToken ct = default)
    {
        var startAtUtc = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        PtSlotCalculator.ValidateStart(clock.UtcNow, startAtUtc);
        var endAtUtc = PtSessionRules.EndAtUtc(startAtUtc);

        var preview = await db.Set<PtEntitlement>().AsNoTracking()
            .Where(e => e.EntitlementId == request.EntitlementId && e.MemberId == memberId)
            .Select(e => new { e.CoachId, e.MemberId })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await LockCoachAndMemberAsync(preview.CoachId, preview.MemberId, ct);
        var entitlement = await LockEntitlementAsync(request.EntitlementId, ct);

        if (entitlement.MemberId != memberId || entitlement.CoachId != preview.CoachId)
        {
            throw new ConflictException(
                "pt_session_assignment_changed", "Phân công PT vừa thay đổi; vui lòng tải lại và thử lại.");
        }

        EnsureActiveWithQuota(entitlement);

        if (!await HasActiveRelationshipAsync(entitlement.MemberId, entitlement.CoachId, ct))
        {
            throw new ConflictException(
                "pt_relationship_required", "Chưa có quan hệ Coach–Member đang hoạt động. Liên hệ trung tâm.");
        }

        EnsureWithinValidity(entitlement, startAtUtc, endAtUtc);
        await EnsureNoConflictAsync(entitlement.CoachId, entitlement.MemberId, startAtUtc, endAtUtc, null, ct);

        var rooms = await availability.GetServiceRoomsAsync(SportServiceType.PersonalTraining, startAtUtc, endAtUtc, ct);
        var freeRooms = PtSlotCalculator.FreeRooms(rooms, startAtUtc, endAtUtc);
        var roomId = request.RoomId ?? freeRooms.FirstOrDefault()?.RoomId;

        if (roomId is null || freeRooms.All(r => r.RoomId != roomId))
        {
            throw new ConflictException("pt_slot_unavailable", "Khung giờ này không còn phòng PT trống. Hãy chọn khung khác.");
        }

        await PtRoomValidator.RequireAsync(catalog, specialties, roomId.Value, entitlement.CoachId, startAtUtc, endAtUtc, ct);

        var session = await PersistNewSessionAsync(
            entitlement, startAtUtc, endAtUtc, roomId, memberId, "SELF_BOOK_PT_SESSION", ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(session.SessionId, ct);
    }

    private async Task<bool> HasActiveRelationshipAsync(Guid memberId, Guid coachId, CancellationToken ct)
        => await db.Set<CoachMemberRelationship>().AsNoTracking()
            .AnyAsync(r => r.MemberId == memberId && r.CoachId == coachId && r.Status == RelationshipStatus.Active, ct);

    public async Task<PtSessionResponse> ManagerCancelAsync(
        Guid sessionId, ManagerCancelPtSessionRequest request, Guid managerId, CancellationToken ct = default)
    {
        var preview = await PreviewSessionAsync(sessionId, ct);
        var timing = PtSessionRules.ClassifyTiming(clock.UtcNow, preview.StartAtUtc);

        return await ApplyCancelAsync(sessionId, timing, request.Reason, managerId, "CANCEL_PT_SESSION", ct);
    }

    internal async Task CancelScheduledForRefundAsync(
        Guid entitlementId, string reason, Guid managerId, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("PT refund cancellation requires the caller's transaction.");
        var sessionIds = await db.Set<PtSession>().AsNoTracking()
            .Where(s => s.EntitlementId == entitlementId && s.Status == PtSessionStatus.Scheduled
                && s.StartAtUtc > clock.UtcNow)
            .OrderBy(s => s.StartAtUtc)
            .Select(s => s.SessionId)
            .ToListAsync(ct);
        foreach (var sessionId in sessionIds)
            await ApplyCancelAsync(sessionId, PtSessionTimingClassification.OnTime, reason, managerId,
                "CANCEL_PT_SESSION_FOR_REFUND", ct, manageTransaction: false);
    }

    public async Task<PtSessionResponse> ManagerRescheduleAsync(
        Guid sessionId, ManagerReschedulePtSessionRequest request, Guid managerId, CancellationToken ct = default)
    {
        var preview = await PreviewSessionAsync(sessionId, ct);
        var timing = PtSessionRules.ClassifyTiming(clock.UtcNow, preview.StartAtUtc);

        return await ApplyRescheduleAsync(
            sessionId, timing, request.NewStartAtUtc, request.Reason, managerId, "RESCHEDULE_PT_SESSION", ct,
            newRoomId: request.RoomId);
    }

    /// <summary>Dùng chung cho Manager cancel trực tiếp và duyệt PtSessionChangeRequest loại Cancel.</summary>
    internal async Task<PtSessionResponse> ApplyCancelAsync(
        Guid sessionId,
        PtSessionTimingClassification timing,
        string reason,
        Guid actorUserId,
        string auditAction,
        CancellationToken ct,
        bool manageTransaction = true)
    {
        if (!manageTransaction && db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("Caller must provide a database transaction.");
        }

        await using var ownedTransaction = manageTransaction
            ? await db.Database.BeginTransactionAsync(ct)
            : null;

        var preview = await PreviewSessionAsync(sessionId, ct);
        await LockCoachAndMemberAsync(preview.CoachId, preview.MemberId, ct);
        var session = await LockSessionAsync(sessionId, ct);

        EnsureAssignmentUnchanged(session, preview);
        var entitlement = await LockEntitlementAsync(session.EntitlementId, ct);

        EnsureCancellable(session);

        var now = clock.UtcNow;

        entitlement.ReservedSessions -= 1;

        if (timing == PtSessionTimingClassification.OnTime)
        {
            session.Status = PtSessionStatus.CancelledOnTime;
            session.QuotaState = PtSessionQuotaState.Released;
        }
        else
        {
            entitlement.ConsumedSessions += 1;
            session.Status = PtSessionStatus.CancelledLate;
            session.QuotaState = PtSessionQuotaState.Consumed;
        }

        entitlement.Version += 1;
        RecomputeExhausted(entitlement);

        session.CancelledAt = now;
        session.CancellationReason = reason.Trim();
        session.Version += 1;

        await occupancy.ReleaseAsync(OccupancySources.PtSession, session.SessionId, ct);

        audit.Write(new AuditEntry(
            actorUserId, auditAction, nameof(PtSession), sessionId.ToString(),
            OldValue: "{\"status\":\"Scheduled\"}",
            NewValue: $"{{\"status\":\"{session.Status}\",\"timing\":\"{timing}\"}}"));

        notifications.Queue(new NotificationRequest(
            session.MemberId,
            NotificationEvents.ClassCancelled,
            $"Buổi PT lúc {VietnamTime.ToLocal(session.StartAtUtc):HH:mm dd/MM/yyyy} đã bị hủy: {reason.Trim()}",
            sessionId));
        await QueueScheduleEmailAsync(session.MemberId, sessionId, NotificationEvents.ClassCancelled,
            $"Buổi PT lúc {VietnamTime.ToLocal(session.StartAtUtc):HH:mm dd/MM/yyyy} đã bị hủy: {reason.Trim()}", ct);

        await db.SaveChangesAsync(ct);

        if (ownedTransaction is not null)
        {
            await ownedTransaction.CommitAsync(ct);
        }

        return await GetAsync(sessionId, ct);
    }

    /// <summary>Dùng chung cho Manager reschedule trực tiếp và duyệt PtSessionChangeRequest loại Reschedule.</summary>
    internal async Task<PtSessionResponse> ApplyRescheduleAsync(
        Guid sessionId,
        PtSessionTimingClassification timing,
        DateTime newStartAtUtc,
        string reason,
        Guid actorUserId,
        string auditAction,
        CancellationToken ct,
        bool manageTransaction = true,
        int? newRoomId = null)
    {
        if (!manageTransaction && db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("Caller must provide a database transaction.");
        }

        await using var ownedTransaction = manageTransaction
            ? await db.Database.BeginTransactionAsync(ct)
            : null;

        var preview = await PreviewSessionAsync(sessionId, ct);
        await LockCoachesAndMemberAsync(
            new[] { preview.CoachId, preview.EntitlementCoachId }, preview.MemberId, ct);
        var session = await LockSessionAsync(sessionId, ct);

        EnsureAssignmentUnchanged(session, preview);
        var entitlement = await LockEntitlementAsync(session.EntitlementId, ct);

        if (entitlement.CoachId != preview.EntitlementCoachId)
        {
            throw new ConflictException(
                "pt_session_assignment_changed",
                "Phân công PT vừa thay đổi; vui lòng tải lại và thử đổi lịch lại.");
        }

        EnsureCancellable(session);

        var newEndAtUtc = PtSessionRules.EndAtUtc(newStartAtUtc);

        EnsureWithinValidity(entitlement, newStartAtUtc, newEndAtUtc);
        await EnsureNoConflictAsync(
            entitlement.CoachId, entitlement.MemberId, newStartAtUtc, newEndAtUtc, excludeSessionId: sessionId, ct);

        // Late reschedule cần thêm 1 quota — kiểm TRƯỚC khi đổi gì để không sửa session cũ khi
        // không còn quota (BE-4 §6.4).
        if (timing == PtSessionTimingClassification.Late)
        {
            var remainingAfterConsume = entitlement.TotalQuota - entitlement.ReservedSessions - entitlement.ConsumedSessions;

            if (remainingAfterConsume <= 0)
            {
                throw new ConflictException(
                    "pt_quota_exhausted", "Không còn quota để đổi lịch trễ hạn cho buổi này.");
            }
        }

        // Phòng của buổi thay thế: mặc định giữ phòng cũ; Manager có thể đổi phòng khi dời.
        var replacementRoomId = newRoomId ?? session.RoomId;
        if (replacementRoomId is int roomToValidate)
        {
            await PtRoomValidator.RequireAsync(catalog, specialties, roomToValidate, entitlement.CoachId, newStartAtUtc, newEndAtUtc, ct);
        }

        var replacement = new PtSession
        {
            SessionId = Guid.NewGuid(),
            EntitlementId = entitlement.EntitlementId,
            MemberId = entitlement.MemberId,
            CoachId = entitlement.CoachId,
            RoomId = replacementRoomId,
            StartAtUtc = newStartAtUtc,
            EndAtUtc = newEndAtUtc,
            Status = PtSessionStatus.Scheduled,
            QuotaState = PtSessionQuotaState.Reserved,
            RescheduledFromSessionId = sessionId,
            CreatedByUserId = actorUserId,
            Version = 0
        };

        db.Set<PtSession>().Add(replacement);

        entitlement.ReservedSessions -= 1;

        if (timing == PtSessionTimingClassification.OnTime)
        {
            // Giải phóng reservation cũ rồi giữ chỗ mới — net không đổi tổng quota.
            session.Status = PtSessionStatus.RescheduledOnTime;
            session.QuotaState = PtSessionQuotaState.Released;
        }
        else
        {
            // Reservation cũ chuyển thành consumed (phạt trễ hạn); buổi mới giữ thêm 1 quota.
            entitlement.ConsumedSessions += 1;
            session.Status = PtSessionStatus.RescheduledLate;
            session.QuotaState = PtSessionQuotaState.Consumed;
        }

        entitlement.ReservedSessions += 1;
        entitlement.Version += 1;

        RecomputeExhausted(entitlement);

        var oldStartAtUtc = session.StartAtUtc;
        session.Version += 1;

        // Nhả lịch cũ rồi chiếm lịch mới (buổi dời có thể chồng chính khung cũ). Xung đột thì exception làm rollback cả thao tác.
        await occupancy.ReleaseAsync(OccupancySources.PtSession, session.SessionId, ct);
        await ReserveOccupancyAsync(replacement, ct);

        audit.Write(new AuditEntry(
            actorUserId, auditAction, nameof(PtSession), sessionId.ToString(),
            OldValue: $"{{\"status\":\"Scheduled\",\"startAtUtc\":\"{oldStartAtUtc:O}\"}}",
            NewValue: $"{{\"status\":\"{session.Status}\",\"replacementSessionId\":\"{replacement.SessionId}\","
                      + $"\"newStartAtUtc\":\"{newStartAtUtc:O}\",\"timing\":\"{timing}\"}}"));

        notifications.Queue(new NotificationRequest(
            session.MemberId,
            NotificationEvents.ScheduleChanged,
            $"Buổi PT lúc {VietnamTime.ToLocal(oldStartAtUtc):HH:mm dd/MM/yyyy} đã được dời sang {VietnamTime.ToLocal(newStartAtUtc):HH:mm dd/MM/yyyy}.",
            replacement.SessionId));
        await QueueScheduleEmailAsync(session.MemberId, replacement.SessionId, NotificationEvents.ScheduleChanged,
            $"Buổi PT lúc {VietnamTime.ToLocal(oldStartAtUtc):HH:mm dd/MM/yyyy} đã được dời sang {VietnamTime.ToLocal(newStartAtUtc):HH:mm dd/MM/yyyy}.", ct);

        await db.SaveChangesAsync(ct);

        if (ownedTransaction is not null)
        {
            await ownedTransaction.CommitAsync(ct);
        }

        return await GetAsync(replacement.SessionId, ct);
    }

    private async Task QueueScheduleEmailAsync(Guid memberId, Guid eventId, string eventType, string message, CancellationToken ct)
    {
        var recipient = await users.GetAsync(memberId, ct);
        if (recipient is not null)
            notifications.QueueEmail(new EmailNotificationRequest(memberId, recipient.Email, eventType, eventId,
                "SportHub - Thay đổi lịch PT", "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
    }

    public async Task<PtSessionResponse> CompleteAsync(Guid sessionId, Guid coachId, CancellationToken ct = default)
    {
        var preview = await PreviewSessionAsync(sessionId, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await LockCoachAndMemberAsync(preview.CoachId, preview.MemberId, ct);
        var session = await LockSessionAsync(sessionId, ct);

        EnsureAssignmentUnchanged(session, preview);

        if (session.CoachId != coachId)
        {
            throw new ForbiddenException("pt_session_not_owned", "Bạn không phải Coach của buổi PT này.");
        }

        // Idempotent — gọi lại sau khi đã Completed không được tạo double-consume.
        if (session.Status == PtSessionStatus.Completed)
        {
            await transaction.CommitAsync(ct);
            return await GetAsync(sessionId, ct);
        }

        if (session.Status != PtSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "pt_session_not_completable", $"Buổi PT đang ở trạng thái {session.Status}, không hoàn thành được.");
        }

        var entitlement = await LockEntitlementAsync(session.EntitlementId, ct);

        entitlement.ReservedSessions -= 1;
        entitlement.ConsumedSessions += 1;
        entitlement.Version += 1;
        RecomputeExhausted(entitlement);

        session.Status = PtSessionStatus.Completed;
        session.QuotaState = PtSessionQuotaState.Consumed;
        session.CompletedAt = clock.UtcNow;
        session.Version += 1;

        await occupancy.ReleaseAsync(OccupancySources.PtSession, session.SessionId, ct);

        audit.Write(new AuditEntry(
            coachId, "COMPLETE_PT_SESSION", nameof(PtSession), sessionId.ToString(),
            OldValue: "{\"status\":\"Scheduled\"}",
            NewValue: "{\"status\":\"Completed\"}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(sessionId, ct);
    }

    public async Task<PtSessionResponse> NoShowAsync(
        Guid sessionId, NoShowPtSessionRequest request, Guid coachId, CancellationToken ct = default)
        => await RecordNoShowAsync(sessionId, request, coachId, ct);

    /// <summary>BR-20: uses the same locked transition as a coach, with a system audit actor.</summary>
    public async Task FinalizeNoShowAsync(Guid sessionId, CancellationToken ct = default)
        => await RecordNoShowAsync(sessionId, new NoShowPtSessionRequest { Reason = "Tự động chốt buổi PT đã kết thúc." }, null, ct);

    private async Task<PtSessionResponse> RecordNoShowAsync(
        Guid sessionId, NoShowPtSessionRequest request, Guid? coachId, CancellationToken ct)
    {
        var preview = await PreviewSessionAsync(sessionId, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await LockCoachAndMemberAsync(preview.CoachId, preview.MemberId, ct);
        var session = await LockSessionAsync(sessionId, ct);

        EnsureAssignmentUnchanged(session, preview);

        if (coachId.HasValue && session.CoachId != coachId)
        {
            throw new ForbiddenException("pt_session_not_owned", "Bạn không phải Coach của buổi PT này.");
        }

        if (session.Status == PtSessionStatus.NoShow
            || (coachId is null && (session.Status != PtSessionStatus.Scheduled || session.EndAtUtc > clock.UtcNow)))
        {
            await transaction.CommitAsync(ct);
            return await GetAsync(sessionId, ct);
        }

        if (session.Status != PtSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "pt_session_not_completable", $"Buổi PT đang ở trạng thái {session.Status}, không ghi no-show được.");
        }

        var entitlement = await LockEntitlementAsync(session.EntitlementId, ct);

        entitlement.ReservedSessions -= 1;
        entitlement.ConsumedSessions += 1;
        entitlement.Version += 1;
        RecomputeExhausted(entitlement);

        session.Status = PtSessionStatus.NoShow;
        session.QuotaState = PtSessionQuotaState.Consumed;
        session.CancelledAt = clock.UtcNow;
        session.CancellationReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        session.Version += 1;

        await occupancy.ReleaseAsync(OccupancySources.PtSession, session.SessionId, ct);

        audit.Write(new AuditEntry(
            coachId ?? session.CoachId, coachId is null ? "AUTO_NO_SHOW_PT_SESSION" : "NO_SHOW_PT_SESSION", nameof(PtSession), sessionId.ToString(),
            OldValue: "{\"status\":\"Scheduled\"}",
            NewValue: "{\"status\":\"NoShow\"}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(sessionId, ct);
    }

    // ---- Chiếm chỗ phòng/coach ----

    /// <summary>
    /// Buổi PT chiếm coach luôn và phòng khi có phòng (nguồn PtSession). Chồng lịch với lớp, thuê sân, khóa phòng hay PT khác
    /// → 409 occupancy_conflict kèm danh sách; DB exclusion constraint là chốt chặn thật khi hai request đua nhau.
    /// </summary>
    private async Task ReserveOccupancyAsync(PtSession session, CancellationToken ct)
    {
        var result = await occupancy.ReserveAsync(new OccupancyRequest(
            OccupancySources.PtSession, session.SessionId, session.RoomId, session.CoachId,
            session.StartAtUtc, session.EndAtUtc), ct);

        if (!result.Succeeded)
        {
            throw new OccupancyConflictException(result.Conflicts);
        }
    }

    // ---- Nội bộ, dùng chung với PtSessionChangeRequestService ----

    private sealed record SessionPreview(
        DateTime StartAtUtc,
        Guid MemberId,
        Guid CoachId,
        Guid EntitlementCoachId);

    private async Task<SessionPreview> PreviewSessionAsync(Guid sessionId, CancellationToken ct)
        => await db.Set<PtSession>().AsNoTracking()
               .Where(s => s.SessionId == sessionId)
               .Select(s => new SessionPreview(
                   s.StartAtUtc,
                   s.MemberId,
                   s.CoachId,
                   s.Entitlement!.CoachId))
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("pt_session_not_found", "Không tìm thấy buổi PT.");

    internal static void EnsureActiveWithQuota(PtEntitlement entitlement)
    {
        if (entitlement.Status != PtEntitlementStatus.Active)
        {
            throw new ConflictException(
                "pt_entitlement_not_active", $"Quyền lợi PT đang ở trạng thái {entitlement.Status}.");
        }

        var remaining = entitlement.TotalQuota - entitlement.ReservedSessions - entitlement.ConsumedSessions;

        if (remaining <= 0)
        {
            throw new ConflictException("pt_quota_exhausted", "Quyền lợi PT đã hết quota.");
        }
    }

    internal static void EnsureWithinValidity(PtEntitlement entitlement, DateTime startAtUtc, DateTime endAtUtc)
    {
        var validityStart = VietnamTime.StartOfDayUtc(entitlement.ValidityStartDate);
        var validityEnd = VietnamTime.EndOfDayExclusiveUtc(entitlement.ValidityEndDate);

        if (startAtUtc < validityStart || endAtUtc > validityEnd)
        {
            throw new ConflictException(
                "pt_session_outside_membership_validity",
                "Buổi PT phải nằm trong hiệu lực Membership hiện hành.");
        }
    }

    internal static void EnsureCancellable(PtSession session)
    {
        if (session.Status != PtSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "pt_session_not_completable", $"Buổi PT đang ở trạng thái {session.Status}, không đổi được.");
        }
    }

    internal static void RecomputeExhausted(PtEntitlement entitlement)
    {
        if (entitlement.Status != PtEntitlementStatus.Active)
        {
            return;
        }

        var remaining = entitlement.TotalQuota - entitlement.ReservedSessions - entitlement.ConsumedSessions;

        if (remaining <= 0)
        {
            entitlement.Status = PtEntitlementStatus.Exhausted;
        }
    }

    internal async Task<PtEntitlement> LockEntitlementAsync(Guid entitlementId, CancellationToken ct)
    {
        var locked = await db.Set<PtEntitlement>()
            .FromSqlInterpolated($"SELECT * FROM pt_entitlements WHERE entitlement_id = {entitlementId} FOR UPDATE")
            .ToListAsync(ct);

        return locked.SingleOrDefault()
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");
    }

    internal async Task<PtSession> LockSessionAsync(Guid sessionId, CancellationToken ct)
    {
        var locked = await db.Set<PtSession>()
            .FromSqlInterpolated($"SELECT * FROM pt_sessions WHERE session_id = {sessionId} FOR UPDATE")
            .ToListAsync(ct);

        return locked.SingleOrDefault()
            ?? throw new NotFoundException("pt_session_not_found", "Không tìm thấy buổi PT.");
    }

    /// <summary>
    /// Khoá transaction-scoped theo Coach rồi Member, LUÔN theo thứ tự này ở mọi call site, để
    /// hai transaction không bao giờ deadlock lẫn nhau vì khoá ngược thứ tự. Tự giải phóng khi
    /// transaction commit/rollback (pg_advisory_XACT_lock).
    /// </summary>
    internal async Task LockCoachAndMemberAsync(Guid coachId, Guid memberId, CancellationToken ct)
        => await LockCoachesAndMemberAsync(new[] { coachId }, memberId, ct);

    internal async Task LockCoachesAndMemberAsync(
        IEnumerable<Guid> coachIds,
        Guid memberId,
        CancellationToken ct)
    {
        foreach (var coachKey in coachIds.Select(id => id.ToString())
                     .Distinct(StringComparer.Ordinal)
                     .OrderBy(value => value, StringComparer.Ordinal))
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock(hashtext('pt_session_coach'), hashtext({coachKey}))", ct);
        }

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext('pt_session_member'), hashtext({memberId.ToString()}))", ct);
    }

    private static void EnsureAssignmentUnchanged(PtSession session, SessionPreview preview)
    {
        if (session.CoachId != preview.CoachId || session.MemberId != preview.MemberId)
        {
            throw new ConflictException(
                "pt_session_assignment_changed",
                "Phân công PT vừa thay đổi; vui lòng tải lại và thử lại.");
        }
    }

    internal async Task EnsureNoConflictAsync(
        Guid coachId, Guid memberId, DateTime startAtUtc, DateTime endAtUtc, Guid? excludeSessionId, CancellationToken ct)
    {
        var coachConflict = await db.Set<PtSession>().AnyAsync(
            s => s.CoachId == coachId
                 && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.PendingPayment)
                 && (excludeSessionId == null || s.SessionId != excludeSessionId)
                 && s.StartAtUtc < endAtUtc && startAtUtc < s.EndAtUtc,
            ct);

        if (coachConflict)
        {
            throw new ConflictException("pt_coach_conflict", "Coach đã có buổi PT khác trùng giờ.");
        }

        var memberConflict = await db.Set<PtSession>().AnyAsync(
            s => s.MemberId == memberId
                 && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.PendingPayment)
                 && (excludeSessionId == null || s.SessionId != excludeSessionId)
                 && s.StartAtUtc < endAtUtc && startAtUtc < s.EndAtUtc,
            ct);

        if (memberConflict)
        {
            throw new ConflictException("pt_member_conflict", "Hội viên đã có buổi PT khác trùng giờ.");
        }
    }

    private Expression<Func<PtSession, PtSessionResponse>> Projection()
        => s => new PtSessionResponse(
            s.SessionId,
            s.EntitlementId,
            s.MemberId,
            s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email,
            s.CoachId,
            s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email,
            s.StartAtUtc,
            s.EndAtUtc,
            s.Status.ToString(),
            s.QuotaState.ToString(),
            s.RescheduledFromSessionId,
            s.CompletedAt,
            s.CancelledAt,
            s.CancellationReason,
            s.RoomId,
            s.RoomId == null ? null : db.Set<Room>().Where(r => r.RoomId == s.RoomId).Select(r => r.Name).FirstOrDefault());
}
