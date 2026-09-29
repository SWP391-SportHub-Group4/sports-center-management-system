using System.Linq.Expressions;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;

namespace SportHub.Training.Application.Services;

/// <summary>
/// BR-74/75 — Member xin đổi PersonalTrainer; Manager duyệt hoặc từ chối. Khi duyệt,
/// entitlement và relationship đổi sang Coach mới trong cùng transaction. Session tương lai
/// chỉ chuyển khi Coach mới không trùng lịch; session conflict giữ Coach cũ để Manager xử lý.
/// </summary>
public sealed class PtCoachChangeRequestService(
    ISportHubDbContext db,
    IAuditWriter audit,
    INotificationWriter notifications,
    IClock clock) : IPtCoachChangeRequestService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<IReadOnlyList<PtCoachChangeRequestResponse>> SearchAsync(
        string? status,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = db.Set<PtCoachChangeRequest>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<PtCoachChangeRequestStatus>(status, ignoreCase: true, out var parsed))
            {
                throw new BadRequestException(
                    "pt_change_request_invalid_state", $"Trạng thái '{status}' không hợp lệ.");
            }

            query = query.Where(r => r.Status == parsed);
        }

        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize);
        return await query.OrderBy(r => r.RequestedAt).ThenBy(r => r.RequestId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
    }

    public async Task<PtCoachChangeRequestResponse> RequestAsync(
        Guid entitlementId,
        RequestPtCoachChangeRequest request,
        Guid memberId,
        CancellationToken ct = default)
    {
        if (request.RequestedCoachId == Guid.Empty)
        {
            throw new BadRequestException("coach_must_be_personal_trainer", "Phải chọn Coach mới.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new BadRequestException(
                "pt_change_request_invalid_state", "Yêu cầu đổi Coach phải có lý do.");
        }

        var entitlement = await db.Set<PtEntitlement>().AsNoTracking()
            .SingleOrDefaultAsync(e => e.EntitlementId == entitlementId, ct)
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");

        if (entitlement.MemberId != memberId)
        {
            throw new ForbiddenException(
                "pt_entitlement_not_owned", "Bạn không phải hội viên của quyền lợi PT này.");
        }

        EnsureChangeable(entitlement);

        if (entitlement.CoachId == request.RequestedCoachId)
        {
            throw new ConflictException(
                "pt_coach_change_same_coach", "Coach được yêu cầu đang là Coach hiện tại của quyền lợi PT.");
        }

        await EnsurePersonalTrainerAsync(request.RequestedCoachId, ct);

        var alreadyPending = await db.Set<PtCoachChangeRequest>().AnyAsync(
            r => r.EntitlementId == entitlementId && r.Status == PtCoachChangeRequestStatus.Pending,
            ct);

        if (alreadyPending)
        {
            throw new ConflictException(
                "pt_coach_change_already_pending", "Quyền lợi PT này đã có yêu cầu đổi Coach đang chờ duyệt.");
        }

        var changeRequest = new PtCoachChangeRequest
        {
            RequestId = Guid.NewGuid(),
            EntitlementId = entitlementId,
            MemberId = memberId,
            CurrentCoachId = entitlement.CoachId,
            RequestedCoachId = request.RequestedCoachId,
            Reason = request.Reason.Trim(),
            RequestedAt = clock.UtcNow,
            Status = PtCoachChangeRequestStatus.Pending
        };

        db.Set<PtCoachChangeRequest>().Add(changeRequest);

        audit.Write(new AuditEntry(
            memberId,
            "CREATE_PT_COACH_CHANGE_REQUEST",
            nameof(PtCoachChangeRequest),
            changeRequest.RequestId.ToString(),
            NewValue: JsonSerializer.Serialize(new
            {
                entitlementId,
                currentCoachId = entitlement.CoachId,
                requestedCoachId = request.RequestedCoachId
            })));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException(
                "pt_coach_change_already_pending", "Quyền lợi PT này đã có yêu cầu đổi Coach đang chờ duyệt.");
        }

        return await GetOneAsync(changeRequest.RequestId, ct);
    }

    public async Task<PtCoachChangeApprovalResponse> ApproveAsync(
        Guid requestId,
        ReviewPtCoachChangeRequest request,
        Guid managerId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var changeRequest = await LockRequestAsync(requestId, ct);
        EnsurePending(changeRequest);

        await LockScheduleParticipantsAsync(
            changeRequest.CurrentCoachId, changeRequest.RequestedCoachId, changeRequest.MemberId, ct);

        var entitlement = await LockEntitlementAsync(changeRequest.EntitlementId, ct);
        EnsureChangeable(entitlement);

        if (entitlement.MemberId != changeRequest.MemberId
            || entitlement.CoachId != changeRequest.CurrentCoachId)
        {
            throw new ConflictException(
                "pt_change_request_invalid_state",
                "Coach hoặc hội viên của quyền lợi PT đã thay đổi sau khi gửi yêu cầu.");
        }

        await EnsurePersonalTrainerAsync(changeRequest.RequestedCoachId, ct);

        var now = clock.UtcNow;
        var futureSessions = await db.Set<PtSession>()
            .FromSqlInterpolated(
                $"SELECT * FROM pt_sessions WHERE entitlement_id = {entitlement.EntitlementId} AND status = {(int)PtSessionStatus.Scheduled} AND start_at_utc > {now} ORDER BY start_at_utc FOR UPDATE")
            .ToListAsync(ct);

        var movedSessionIds = new List<Guid>();
        var unmovedSessionIds = new List<Guid>();

        foreach (var session in futureSessions)
        {
            var coachConflict = await db.Set<PtSession>().AnyAsync(
                s => s.CoachId == changeRequest.RequestedCoachId
                     && s.Status == PtSessionStatus.Scheduled
                     && s.SessionId != session.SessionId
                     && s.StartAtUtc < session.EndAtUtc
                     && session.StartAtUtc < s.EndAtUtc,
                ct);

            if (coachConflict)
            {
                unmovedSessionIds.Add(session.SessionId);
                continue;
            }

            session.CoachId = changeRequest.RequestedCoachId;
            session.Version += 1;
            movedSessionIds.Add(session.SessionId);
        }

        entitlement.CoachId = changeRequest.RequestedCoachId;
        entitlement.Version += 1;

        await ReplaceRelationshipAsync(
            entitlement.EntitlementId,
            changeRequest.MemberId,
            changeRequest.CurrentCoachId,
            changeRequest.RequestedCoachId,
            now,
            ct);

        changeRequest.Status = PtCoachChangeRequestStatus.Approved;
        changeRequest.ReviewedByUserId = managerId;
        changeRequest.ReviewedAt = now;
        changeRequest.ReviewNote = Normalize(request.ReviewNote);

        audit.Write(new AuditEntry(
            managerId,
            "APPROVE_PT_COACH_CHANGE_REQUEST",
            nameof(PtCoachChangeRequest),
            requestId.ToString(),
            OldValue: JsonSerializer.Serialize(new { coachId = changeRequest.CurrentCoachId }),
            NewValue: JsonSerializer.Serialize(new
            {
                coachId = changeRequest.RequestedCoachId,
                movedSessionIds,
                unmovedSessionIds
            })));

        QueueApprovalNotifications(changeRequest, movedSessionIds.Count, unmovedSessionIds.Count);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new PtCoachChangeApprovalResponse(
            await GetOneAsync(requestId, ct),
            movedSessionIds,
            unmovedSessionIds);
    }

    public async Task<PtCoachChangeRequestResponse> RejectAsync(
        Guid requestId,
        ReviewPtCoachChangeRequest request,
        Guid managerId,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ReviewNote))
        {
            throw new BadRequestException(
                "pt_change_request_invalid_state", "Từ chối yêu cầu đổi Coach phải có lý do.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var changeRequest = await LockRequestAsync(requestId, ct);
        EnsurePending(changeRequest);

        changeRequest.Status = PtCoachChangeRequestStatus.Rejected;
        changeRequest.ReviewedByUserId = managerId;
        changeRequest.ReviewedAt = clock.UtcNow;
        changeRequest.ReviewNote = request.ReviewNote.Trim();

        audit.Write(new AuditEntry(
            managerId,
            "REJECT_PT_COACH_CHANGE_REQUEST",
            nameof(PtCoachChangeRequest),
            requestId.ToString(),
            NewValue: "{\"status\":\"Rejected\"}"));

        notifications.Queue(new NotificationRequest(
            changeRequest.MemberId,
            NotificationEvents.ScheduleChanged,
            $"Yêu cầu đổi Coach PT đã bị từ chối: {changeRequest.ReviewNote}",
            requestId));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOneAsync(requestId, ct);
    }

    private async Task ReplaceRelationshipAsync(
        Guid entitlementId,
        Guid memberId,
        Guid oldCoachId,
        Guid newCoachId,
        DateTime changedAt,
        CancellationToken ct)
    {
        var anotherCurrentEntitlement = await db.Set<PtEntitlement>().AnyAsync(
            e => e.EntitlementId != entitlementId
                 && e.MemberId == memberId
                 && e.CoachId == oldCoachId
                 && e.Status != PtEntitlementStatus.PendingPayment
                 && e.Status != PtEntitlementStatus.Cancelled
                 && e.Status != PtEntitlementStatus.Expired,
            ct);

        if (!anotherCurrentEntitlement)
        {
            var oldRelationships = await db.Set<CoachMemberRelationship>()
                .Where(r => r.MemberId == memberId
                            && r.CoachId == oldCoachId
                            && r.Status == RelationshipStatus.Active)
                .ToListAsync(ct);

            foreach (var relationship in oldRelationships)
            {
                relationship.Status = RelationshipStatus.Ended;
                relationship.EndedAt = changedAt;
            }
        }

        var newRelationshipExists = await db.Set<CoachMemberRelationship>().AnyAsync(
            r => r.MemberId == memberId
                 && r.CoachId == newCoachId
                 && r.Status == RelationshipStatus.Active,
            ct);

        if (!newRelationshipExists)
        {
            db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(),
                MemberId = memberId,
                CoachId = newCoachId,
                SourceType = RelationshipSourceType.AssignedByManager,
                Status = RelationshipStatus.Active,
                StartedAt = changedAt
            });
        }
    }

    private async Task EnsurePersonalTrainerAsync(Guid coachId, CancellationToken ct)
    {
        var valid = await db.Set<UserAccount>().AsNoTracking().AnyAsync(
            u => u.UserId == coachId
                 && u.Status == UserStatus.Active
                 && u.Role!.RoleName == UserRole.Coach
                 && u.CoachProfile != null
                 && u.CoachProfile.CoachCategory == CoachCategory.PersonalTrainer,
            ct);

        if (!valid)
        {
            throw new BadRequestException(
                "coach_must_be_personal_trainer",
                "Coach mới phải là PersonalTrainer có tài khoản đang hoạt động.");
        }
    }

    private static void EnsureChangeable(PtEntitlement entitlement)
    {
        if (entitlement.Status is PtEntitlementStatus.PendingPayment
            or PtEntitlementStatus.Cancelled
            or PtEntitlementStatus.Expired)
        {
            throw new ConflictException(
                "pt_entitlement_not_active",
                $"Quyền lợi PT đang ở trạng thái {entitlement.Status}, không đổi Coach được.");
        }
    }

    private static void EnsurePending(PtCoachChangeRequest changeRequest)
    {
        if (changeRequest.Status != PtCoachChangeRequestStatus.Pending)
        {
            throw new ConflictException(
                "pt_change_request_invalid_state",
                $"Yêu cầu đang ở trạng thái {changeRequest.Status}, không xử lý lại được.");
        }
    }

    private async Task<PtCoachChangeRequest> LockRequestAsync(Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<PtCoachChangeRequest>()
            .FromSqlInterpolated(
                $"SELECT * FROM pt_coach_change_requests WHERE request_id = {requestId} FOR UPDATE")
            .ToListAsync(ct);

        return rows.SingleOrDefault()
            ?? throw new NotFoundException(
                "pt_coach_change_request_not_found", "Không tìm thấy yêu cầu đổi Coach.");
    }

    private async Task<PtEntitlement> LockEntitlementAsync(Guid entitlementId, CancellationToken ct)
    {
        var rows = await db.Set<PtEntitlement>()
            .FromSqlInterpolated(
                $"SELECT * FROM pt_entitlements WHERE entitlement_id = {entitlementId} FOR UPDATE")
            .ToListAsync(ct);

        return rows.SingleOrDefault()
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");
    }

    private async Task LockScheduleParticipantsAsync(
        Guid oldCoachId,
        Guid newCoachId,
        Guid memberId,
        CancellationToken ct)
    {
        var coachKeys = new[] { oldCoachId.ToString(), newCoachId.ToString() }
            .Distinct(StringComparer.Ordinal)
            .OrderBy(value => value, StringComparer.Ordinal);

        foreach (var coachKey in coachKeys)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock(hashtext('pt_session_coach'), hashtext({coachKey}))",
                ct);
        }

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext('pt_session_member'), hashtext({memberId.ToString()}))",
            ct);
    }

    private void QueueApprovalNotifications(
        PtCoachChangeRequest changeRequest,
        int movedCount,
        int unmovedCount)
    {
        var message = $"Yêu cầu đổi Coach PT đã được duyệt. {movedCount} buổi được chuyển; "
                      + $"{unmovedCount} buổi trùng lịch giữ Coach cũ để Manager xử lý.";

        foreach (var userId in new[]
                 {
                     changeRequest.MemberId,
                     changeRequest.CurrentCoachId,
                     changeRequest.RequestedCoachId
                 }.Distinct())
        {
            notifications.Queue(new NotificationRequest(
                userId, NotificationEvents.ScheduleChanged, message, changeRequest.RequestId));
        }
    }

    private async Task<PtCoachChangeRequestResponse> GetOneAsync(Guid requestId, CancellationToken ct)
        => await db.Set<PtCoachChangeRequest>().AsNoTracking()
               .Where(r => r.RequestId == requestId)
               .Select(Projection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException(
               "pt_coach_change_request_not_found", "Không tìm thấy yêu cầu đổi Coach.");

    private static Expression<Func<PtCoachChangeRequest, PtCoachChangeRequestResponse>> Projection()
        => r => new PtCoachChangeRequestResponse(
            r.RequestId,
            r.EntitlementId,
            r.MemberId,
            r.Member!.Profile != null ? r.Member.Profile.FullName : r.Member.Email,
            r.CurrentCoachId,
            r.CurrentCoach!.Profile != null ? r.CurrentCoach.Profile.FullName : r.CurrentCoach.Email,
            r.RequestedCoachId,
            r.RequestedCoach!.Profile != null ? r.RequestedCoach.Profile.FullName : r.RequestedCoach.Email,
            r.Reason,
            r.RequestedAt,
            r.Status.ToString(),
            r.ReviewedByUserId,
            r.ReviewedAt,
            r.ReviewNote);

    private static string? Normalize(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
