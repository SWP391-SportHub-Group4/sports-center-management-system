using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

public sealed partial class PtSessionService
{
    public async Task<PtAvailabilityResponse> GetPurchaseAvailabilityAsync(
        Guid memberId, Guid memberPackageId, Guid coachId, DateOnly fromDate, DateOnly toDate,
        IMembershipAccessReader memberships, CancellationToken ct)
    {
        if (toDate < fromDate || toDate.DayNumber - fromDate.DayNumber + 1 > PtSessionRules.MaxAvailabilityRangeDays)
            throw new BadRequestException("invalid_availability_range", "Khoảng ngày PT tối đa 14 ngày.");
        var package = await memberships.GetByIdAsync(memberPackageId, ct);
        if (package is null || package.MemberId != memberId)
            throw new NotFoundException("membership_not_found", "Không tìm thấy Membership.");
        var today = VietnamTime.TodayLocal(clock);
        if (package.Status != "Active" || package.StartDate > today || package.EndDate < today)
            throw new ConflictException("membership_not_active", "Cần Membership Gym còn hiệu lực để đặt PT.");
        if (!await specialties.IsPersonalTrainerAsync(coachId, ct))
            throw new BadRequestException("coach_must_be_personal_trainer", "Coach chưa có chuyên môn PT.");
        var coachName = await db.Set<UserAccount>().Where(u => u.UserId == coachId)
            .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).SingleAsync(ct);
        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);
        var rooms = await availability.GetServiceRoomsAsync(SportServiceType.PersonalTraining, fromUtc, toUtc, ct);
        var coachBusy = await availability.GetCoachBusyAsync(coachId, fromUtc, toUtc, ct);
        var memberBusy = await db.Set<PtSession>().AsNoTracking()
            .Where(s => s.MemberId == memberId && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.PendingPayment)
                && s.StartAtUtc < toUtc && s.EndAtUtc > fromUtc)
            .Select(s => new TimeWindow(s.StartAtUtc, s.EndAtUtc)).ToListAsync(ct);
        var slots = PtSlotCalculator.Compute(clock.UtcNow, fromDate, toDate, rooms, coachBusy, memberBusy,
            VietnamTime.StartOfDayUtc(package.StartDate), VietnamTime.EndOfDayExclusiveUtc(package.EndDate));
        return new PtAvailabilityResponse(Guid.Empty, coachId, coachName, 90, 0,
            rooms.Count == 0 ? "pt_no_room_configured" : null,
            new PtBookingPolicy(PtSessionRules.SelfBookMinLeadHours, PtSessionRules.SelfBookMaxAdvanceDays,
                PtSessionRules.SlotStepMinutes, PtSessionRules.ChangeDeadlineHours),
            slots.Select(s => new PtAvailabilitySlot(s.StartAtUtc, s.EndAtUtc,
                s.Rooms.Select(r => new PtAvailabilityRoom(r.RoomId, r.Name)).ToList())).ToList());
    }

    internal async Task HoldPurchaseSessionAsync(Guid entitlementId, DateTime start, int? requestedRoomId,
        Guid memberId, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("PT hold requires a transaction.");
        PtSlotCalculator.ValidateStart(clock.UtcNow, start);
        var preview = await db.Set<PtEntitlement>().AsNoTracking().SingleAsync(e => e.EntitlementId == entitlementId, ct);
        await LockCoachAndMemberAsync(preview.CoachId, memberId, ct);
        var entitlement = await LockEntitlementAsync(entitlementId, ct);
        if (entitlement.MemberId != memberId || entitlement.Status != PtEntitlementStatus.PendingPayment || entitlement.TotalQuota != 1)
            throw new ConflictException("pt_checkout_invalid", "Không thể giữ lịch PT này.");
        var end = PtSessionRules.EndAtUtc(start);
        EnsureWithinValidity(entitlement, start, end);
        await EnsureNoConflictAsync(entitlement.CoachId, memberId, start, end, null, ct);
        var rooms = await availability.GetServiceRoomsAsync(SportServiceType.PersonalTraining, start, end, ct);
        var free = PtSlotCalculator.FreeRooms(rooms, start, end);
        var roomId = requestedRoomId ?? free.FirstOrDefault()?.RoomId;
        if (roomId is null || free.All(r => r.RoomId != roomId))
            throw new ConflictException("pt_slot_unavailable", "Khung giờ này đã hết phòng PT. Chọn lịch khác.");
        await PtRoomValidator.RequireAsync(catalog, specialties, roomId.Value, entitlement.CoachId, start, end, ct);
        await PersistNewSessionAsync(entitlement, start, end, roomId, memberId, "HOLD_PT_SESSION_CHECKOUT", ct,
            PtSessionStatus.PendingPayment);
        await db.SaveChangesAsync(ct);
    }

    internal async Task ConfirmPurchaseSessionAsync(Guid entitlementId, CancellationToken ct)
    {
        var pending = await db.Set<PtSession>().Where(s => s.EntitlementId == entitlementId
            && s.Status == PtSessionStatus.PendingPayment).ToListAsync(ct);
        foreach (var session in pending)
        {
            await LockCoachAndMemberAsync(session.CoachId, session.MemberId, ct);
            session.Status = PtSessionStatus.Scheduled;
            session.Version++;
            if (!await HasActiveRelationshipAsync(session.MemberId, session.CoachId, ct))
            {
                var relationship = new CoachMemberRelationship { RelationshipId = Guid.NewGuid(),
                    CoachId = session.CoachId, MemberId = session.MemberId, SourceType = RelationshipSourceType.Personal,
                    Status = RelationshipStatus.Active, StartedAt = clock.UtcNow };
                db.Set<CoachMemberRelationship>().Add(relationship);
                audit.Write(new AuditEntry(session.MemberId, "CREATE_PAID_PT_RELATIONSHIP", nameof(CoachMemberRelationship),
                    relationship.RelationshipId.ToString(), NewValue: $"{{\"sessionId\":\"{session.SessionId}\"}}"));
            }
            audit.Write(new AuditEntry(session.MemberId, "CONFIRM_PAID_PT_SESSION", nameof(PtSession), session.SessionId.ToString()));
        }
        await db.SaveChangesAsync(ct);
    }

    internal async Task ReleasePurchaseSessionAsync(Guid entitlementId, string reason, CancellationToken ct)
    {
        var pending = await db.Set<PtSession>().Where(s => s.EntitlementId == entitlementId
            && s.Status == PtSessionStatus.PendingPayment).ToListAsync(ct);
        foreach (var session in pending)
        {
            await LockCoachAndMemberAsync(session.CoachId, session.MemberId, ct);
            var entitlement = await LockEntitlementAsync(entitlementId, ct);
            session.Status = PtSessionStatus.CancelledOnTime;
            session.QuotaState = PtSessionQuotaState.Released;
            session.CancelledAt = clock.UtcNow;
            session.CancellationReason = reason;
            session.Version++;
            entitlement.ReservedSessions--;
            entitlement.Version++;
            await occupancy.ReleaseAsync(OccupancySources.PtSession, session.SessionId, ct);
            audit.Write(new AuditEntry(session.MemberId, "RELEASE_UNPAID_PT_SESSION", nameof(PtSession), session.SessionId.ToString(), Reason: reason));
        }
        await db.SaveChangesAsync(ct);
    }
}
