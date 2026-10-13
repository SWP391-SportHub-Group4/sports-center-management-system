using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>Preview first; resolution only commits when every affected resource has an implemented safe disposition.</summary>
public sealed class IncidentService(ISportHubDbContext db, IOccupancyService occupancy,
    ICourtRentalFulfillment rentals, ICheckoutLifecycleService checkouts, IRefundCreditService refunds,
    INotificationWriter notifications, IUserAccessReader users, IAuditWriter audit, IClock clock,
    INotificationDeliveryReader delivery, IMembershipClosureExtension membershipExtension)
{
    public async Task<PagedResult<IncidentDetailsResponse>> ListAsync(int page = 1, int pageSize = 20,
        CancellationToken ct = default)
    {
        page = Math.Clamp(page, 1, 1000000);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<IncidentNotice>().AsNoTracking();
        var count = await query.CountAsync(ct);
        var items = await HistoryQuery(query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.IncidentId)
            .Skip((page - 1) * pageSize).Take(pageSize))
            .ToListAsync(ct);
        return new() { Items = items.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.IncidentId).ToArray(),
            Page = page, PageSize = pageSize, TotalCount = count };
    }

    public async Task<IncidentDetailsResponse> GetAsync(Guid incidentId, CancellationToken ct = default)
        => await HistoryQuery(db.Set<IncidentNotice>().AsNoTracking().Where(x => x.IncidentId == incidentId))
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");

    private IQueryable<IncidentDetailsResponse> HistoryQuery(IQueryable<IncidentNotice> query)
        => from incident in query
           join room in db.Set<Room>().AsNoTracking() on incident.RoomId equals (int?)room.RoomId into rooms
           from room in rooms.DefaultIfEmpty()
           select new IncidentDetailsResponse(incident.IncidentId, incident.Scope.ToString(), incident.RoomId,
               room == null ? null : room.Name, incident.StartAtUtc, incident.EndAtUtc,
               incident.Reason, incident.ResolutionSummary, incident.CreatedAtUtc);

    public async Task<NotificationDelivery> DeliveryAsync(Guid incidentId, CancellationToken ct = default)
    {
        if (!await db.Set<IncidentNotice>().AnyAsync(x => x.IncidentId == incidentId, ct))
            throw new NotFoundException("incident_not_found", "Incident not found.");
        var ids = await db.Set<CourtRental>().Where(x => x.CancellationIncidentId == incidentId)
            .Select(x => x.CourtRentalId).ToListAsync(ct);
        return await delivery.GetManyAsync(NotificationEvents.IncidentResolution, ids, ct);
    }

    public async Task<IncidentPreviewResponse> PreviewAsync(IncidentRequest request, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        var needsManual = impacts.Any(x => x.SourceType is nameof(OccupancySourceType.ClassSession)
            or nameof(OccupancySourceType.RoomBlock));
        var gymClosed = await ClosesGymAsync(shape, ct);
        var startLocal = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        return new IncidentPreviewResponse(shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc,
            impacts, !needsManual, needsManual
                ? "The time slot affects a class or room block. Reschedule or arrange a makeup before blocking the room."
                : null)
        {
            ClosesGym = gymClosed,
            SuggestedMembershipExtensionDays = gymClosed ? FullClosedDays(shape.StartUtc, shape.EndUtc) : 0,
            AffectedMemberCount = gymClosed ? await membershipExtension.CountAffectedMembersAsync(startLocal, ct) : 0
        };
    }

    public async Task<Guid> ResolveAsync(IncidentRequest request, Guid managerId, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        var extensionDays = request.MembershipExtensionDays ?? 0;
        if (extensionDays is < 0 or > 31)
            throw new BadRequestException("invalid_membership_extension_days", "Membership extension must be between 0 and 31 days.");
        if (extensionDays > 0 && !await ClosesGymAsync(shape, ct))
            throw new BadRequestException("membership_extension_not_applicable",
                "Membership extension only applies when the incident closes every active Gym room.");
        var incidentId = Guid.NewGuid();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Lock item invoices before rental/resource rows so cancellation follows invoice → item → wallet → occupancy.
        var firstImpacts = await FindImpactsAsync(shape, ct);
        EnsureResolvable(firstImpacts);
        var rentalIds = firstImpacts.Where(x => x.SourceType == nameof(OccupancySourceType.CourtRental))
            .Select(x => x.SourceId).Distinct().ToList();
        var rentalRows = await db.Set<CourtRental>().Where(x => rentalIds.Contains(x.CourtRentalId))
            .OrderBy(x => x.InvoiceId).ThenBy(x => x.CourtRentalId).ToListAsync(ct);
        if (rentalRows.Count != rentalIds.Count)
            throw new ConflictException("incident_rental_reference_missing", "Incident rental reference missing.");
        var pendingIds = rentalRows.Where(x => x.Status == CourtRentalStatus.PendingPayment)
            .Select(x => x.CourtRentalId).ToHashSet();

        foreach (var rental in rentalRows.Where(x => x.Status == CourtRentalStatus.PendingPayment))
        {
            if (rental.InvoiceId is not Guid invoiceId)
                throw new ConflictException("incident_checkout_reference_missing", "Incident checkout reference missing.");
            await checkouts.ReleaseForSystemAsync(invoiceId, "Cancelled", ct);
        }
        foreach (var rental in rentalRows.Where(x => x.Status == CourtRentalStatus.Confirmed).OrderBy(x => x.InvoiceId))
        {
            if (rental.InvoiceItemId is not Guid itemId)
                throw new ConflictException("incident_rental_item_missing", "Incident rental item missing.");
            await refunds.LockPaidItemAsync(itemId, ct);
        }

        foreach (var rental in rentalRows.Where(x => x.Status == CourtRentalStatus.Confirmed))
        {
            var itemId = rental.InvoiceItemId!.Value;
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "CenterFault:" + request.Reason.Trim(), incidentId), ct);
            await rentals.CancelAsync(rental.CourtRentalId, request.Reason.Trim(), centerFault: true,
                incidentId: incidentId, cancellationToken: ct);
        }
        foreach (var rental in rentalRows)
        {
            rental.CancellationIncidentId = incidentId;
            var access = await users.GetAsync(rental.MemberId, ct);
            if (access is not null)
            {
                var source = rental.CourtRentalId;
                var text = pendingIds.Contains(rental.CourtRentalId)
                    ? "The pending court rental was canceled due to a center incident; held points were released. Contact the manager for priority rebooking support."
                    : "The court rental was canceled due to a center incident; 100% of the paid value was refunded as wallet points. Contact the manager for priority rebooking support.";
                notifications.Queue(new NotificationRequest(rental.MemberId,
                    NotificationEvents.IncidentResolution, text, source));
                notifications.QueueEmail(new EmailNotificationRequest(rental.MemberId, access.Email,
                    NotificationEvents.IncidentResolution, source, "SportHub - Court rental canceled",
                    "<p>" + text + "</p>"));
            }
        }

        // Credits/releases follow item→wallet→rental order. Serialize calendar writers afterward,
        // recheck, then let the occupancy exclusion constraint close the final race.
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        EnsureResolvable(impacts);
        if (impacts.Any(x => x.SourceType != nameof(OccupancySourceType.CourtRental)))
            throw new ConflictException("incident_schedule_changed", "Incident schedule changed.");

        // BR-130/138: Gym đóng cửa không hoàn Membership; cộng đúng số ngày đóng cửa cho Membership Active và báo hội viên.
        var closureStartLocal = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        var extended = extensionDays > 0
            ? await membershipExtension.ExtendActiveAsync(extensionDays, closureStartLocal, ct)
            : [];
        foreach (var member in extended)
        {
            var text = $"The Gym was closed because of a center incident. Your membership has been extended by {extensionDays} "
                + $"day{(extensionDays == 1 ? string.Empty : "s")} and now ends on {member.NewEndDate:dd/MM/yyyy}.";
            notifications.Queue(new NotificationRequest(member.MemberId, NotificationEvents.IncidentResolution,
                text, member.MemberPackageId));
            notifications.QueueEmail(new EmailNotificationRequest(member.MemberId, member.Email,
                NotificationEvents.IncidentResolution, member.MemberPackageId, "SportHub - Gym closure: membership extended",
                "<p>" + text + "</p>"));
        }

        var notice = new IncidentNotice
        {
            IncidentId = incidentId, Scope = shape.Scope, RoomId = shape.RoomId,
            StartAtUtc = shape.StartUtc, EndAtUtc = shape.EndUtc,
            Reason = request.Reason.Trim(),
            ResolutionSummary = $"Affected court rentals were refunded and {shape.RoomIds.Count} rooms were blocked during the incident."
                + (extensionDays > 0 ? $" {extended.Count} members' active memberships were extended by {extensionDays} days." : string.Empty),
            CreatedByUserId = managerId, CreatedAtUtc = clock.UtcNow,
            MembershipExtensionDays = extensionDays, ExtendedMemberCount = extended.Count
        };
        db.Set<IncidentNotice>().Add(notice);
        foreach (var roomId in shape.RoomIds.Order())
        {
            var block = new RoomBlock
            {
                BlockId = Guid.NewGuid(), RoomId = roomId, StartAtUtc = shape.StartUtc, EndAtUtc = shape.EndUtc,
                Reason = request.Reason.Trim(), IncidentId = incidentId, CreatedByUserId = managerId
            };
            var result = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.RoomBlock,
                block.BlockId, roomId, null, new DateTimeOffset(shape.StartUtc, TimeSpan.Zero),
                new DateTimeOffset(shape.EndUtc, TimeSpan.Zero)), ct);
            if (!result.Succeeded) throw new OccupancyConflictException(result.Conflicts);
            db.Set<RoomBlock>().Add(block);
        }
        audit.Write(new AuditEntry(managerId, "RESOLVE_CENTER_INCIDENT", nameof(IncidentNotice), incidentId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                scope = shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc,
                affectedSources = firstImpacts.Select(x => new { x.SourceType, x.SourceId }),
                cancelledRentals = rentalRows.Count, blockedRooms = shape.RoomIds.Count,
                membershipExtensionDays = extensionDays, extendedMembers = extended.Count
            }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return incidentId;
    }

    /// <summary>Gym đóng cửa khi mọi phòng Gym đang hoạt động nằm trong phạm vi sự cố (phòng Gym = phòng có loại phòng thuộc môn Gym).</summary>
    private async Task<bool> ClosesGymAsync(IncidentShape shape, CancellationToken ct)
    {
        var gymRoomIds = await GymRooms.ActiveRoomIds(db).ToListAsync(ct);
        return gymRoomIds.Count > 0 && gymRoomIds.All(shape.RoomIds.Contains);
    }

    /// <summary>Số ngày dương lịch Việt Nam được phủ trọn bởi khoảng đóng cửa; Manager có thể chỉnh trước khi xác nhận.</summary>
    private static int FullClosedDays(DateTime startUtc, DateTime endUtc)
    {
        var day = DateOnly.FromDateTime(VietnamTime.ToLocal(startUtc));
        if (VietnamTime.StartOfDayUtc(day) < startUtc) day = day.AddDays(1);
        var count = 0;
        while (VietnamTime.EndOfDayExclusiveUtc(day) <= endUtc) { count++; day = day.AddDays(1); }
        return Math.Min(count, 31);
    }

    private async Task<IncidentShape> ValidateAsync(IncidentRequest request, CancellationToken ct)
    {
        if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<IncidentScope>(request.Scope, true, out var scope) || !Enum.IsDefined(scope))
            throw new BadRequestException("invalid_incident_scope", "Invalid incident scope.");
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("incident_reason_required", "Incident reason required.");
        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.EndAtUtc, DateTimeKind.Utc);
        if (end <= start || end <= clock.UtcNow || end - start > TimeSpan.FromDays(31))
            throw new BadRequestException("invalid_incident_range", "Invalid incident range.");
        List<int> roomIds;
        int? roomId = request.RoomId;
        if (scope == IncidentScope.Room)
        {
            if (roomId is null || !await db.Set<Room>().AnyAsync(x => x.RoomId == roomId, ct))
                throw new NotFoundException("incident_room_not_found", "Incident room not found.");
            roomIds = [roomId.Value];
        }
        else
        {
            roomId = null;
            roomIds = await db.Set<Room>().AsNoTracking().Where(x => x.IsActive)
                .OrderBy(x => x.RoomId).Select(x => x.RoomId).ToListAsync(ct);
            if (roomIds.Count == 0) throw new ConflictException("incident_no_active_rooms", "Incident no active rooms.");
        }
        return new IncidentShape(scope, roomId, start, end, roomIds);
    }

    private async Task<List<IncidentImpact>> FindImpactsAsync(IncidentShape shape, CancellationToken ct)
    {
        var roomRows = await db.Set<RoomOccupancy>().AsNoTracking().Where(x => x.IsActive
                && shape.RoomIds.Contains(x.RoomId) && x.StartAtUtc < shape.EndUtc && x.EndAtUtc > shape.StartUtc)
            .Select(x => new IncidentImpact(x.SourceType.ToString(), x.SourceId, x.StartAtUtc, x.EndAtUtc)).ToListAsync(ct);
        if (shape.Scope == IncidentScope.Center)
        {
            var coachRows = await db.Set<CoachOccupancy>().AsNoTracking().Where(x => x.IsActive
                    && x.StartAtUtc < shape.EndUtc && x.EndAtUtc > shape.StartUtc)
                .Select(x => new IncidentImpact(x.SourceType.ToString(), x.SourceId, x.StartAtUtc, x.EndAtUtc)).ToListAsync(ct);
            roomRows.AddRange(coachRows);
        }
        return roomRows.GroupBy(x => new { x.SourceType, x.SourceId }).Select(x => x.OrderBy(y => y.StartAtUtc).First())
            .OrderBy(x => x.StartAtUtc).ThenBy(x => x.SourceType).ToList();
    }

    private static void EnsureResolvable(IReadOnlyCollection<IncidentImpact> impacts)
    {
        if (impacts.Any(x => x.SourceType is nameof(OccupancySourceType.ClassSession)
            or nameof(OccupancySourceType.RoomBlock)))
            throw new ConflictException("incident_requires_schedule_resolution",
                "Incident requires schedule resolution.");
        if (impacts.Any(x => x.SourceType != nameof(OccupancySourceType.CourtRental)))
            throw new ConflictException("incident_source_unsupported", "Incident source unsupported.");
    }

    private sealed record IncidentShape(IncidentScope Scope, int? RoomId, DateTime StartUtc, DateTime EndUtc, List<int> RoomIds);
}

public sealed record IncidentRequest([property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc, string Reason,
    int? MembershipExtensionDays = null);
public sealed record IncidentDetailsResponse(Guid IncidentId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, string? RoomName,
    DateTime StartAtUtc, DateTime EndAtUtc, string Reason, string ResolutionSummary, DateTime CreatedAtUtc);
public sealed record IncidentImpact([property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId, DateTime StartAtUtc, DateTime EndAtUtc)
{
    public IReadOnlyList<IncidentResolutionOption> ResolutionOptions => SourceType switch
    {
        "ClassSession" => [new("Reschedule", "POST", $"/api/class-sessions/{SourceId}/reschedule"),
            new("CancelWithMakeup", "POST", $"/api/class-sessions/{SourceId}/cancel")],
        "RoomBlock" => [new("RemoveExistingBlock", "DELETE", $"/api/manager/room-blocks/{SourceId}")],
        "CourtRental" => [new("AutoCancelAndRefundOnResolve", "POST", "/api/manager/incidents/resolve")],
        _ => []
    };
}
public sealed record IncidentResolutionOption(string Action, string Method, string Path);
public sealed record IncidentPreviewResponse([property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc,
    IReadOnlyList<IncidentImpact> Impacts, bool CanResolve, string? BlockReason)
{
    public bool ClosesGym { get; init; }
    public int SuggestedMembershipExtensionDays { get; init; }
    public int AffectedMemberCount { get; init; }
}
