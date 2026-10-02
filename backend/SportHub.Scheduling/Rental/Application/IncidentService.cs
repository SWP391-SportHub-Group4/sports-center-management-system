using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>Preview first; resolution only commits when every affected resource has an implemented safe disposition.</summary>
public sealed class IncidentService(ISportHubDbContext db, IOccupancyService occupancy,
    ICourtRentalFulfillment rentals, ICheckoutLifecycleService checkouts, IRefundCreditService refunds,
    INotificationWriter notifications, IUserAccessReader users, IAuditWriter audit, IClock clock,
    INotificationDeliveryReader delivery)
{
    public async Task<NotificationDelivery> DeliveryAsync(Guid incidentId, CancellationToken ct = default)
    {
        if (!await db.Set<IncidentNotice>().AnyAsync(x => x.IncidentId == incidentId, ct))
            throw new NotFoundException("incident_not_found", "Không tìm thấy sự cố.");
        var ids = await db.Set<CourtRental>().Where(x => x.CancellationIncidentId == incidentId)
            .Select(x => x.CourtRentalId).ToListAsync(ct);
        return await delivery.GetManyAsync(NotificationEvents.IncidentResolution, ids, ct);
    }

    public async Task<IncidentPreviewResponse> PreviewAsync(IncidentRequest request, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        var needsManual = impacts.Any(x => x.SourceType is nameof(OccupancySourceType.ClassSession)
            or nameof(OccupancySourceType.PtSession) or nameof(OccupancySourceType.RoomBlock));
        return new IncidentPreviewResponse(shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc,
            impacts, !needsManual, needsManual
                ? "Khung giờ ảnh hưởng lớp/PT/block; cần phương án dời hoặc bù trước khi khóa phòng."
                : null);
    }

    public async Task<Guid> ResolveAsync(IncidentRequest request, Guid managerId, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
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
            throw new ConflictException("incident_rental_reference_missing", "Không tìm thấy một trong các lượt thuê bị ảnh hưởng.");
        var pendingIds = rentalRows.Where(x => x.Status == CourtRentalStatus.PendingPayment)
            .Select(x => x.CourtRentalId).ToHashSet();

        foreach (var rental in rentalRows.Where(x => x.Status == CourtRentalStatus.PendingPayment))
        {
            if (rental.InvoiceId is not Guid invoiceId)
                throw new ConflictException("incident_checkout_reference_missing", "Checkout thuê sân thiếu hóa đơn.");
            await checkouts.ReleaseForSystemAsync(invoiceId, "Cancelled", ct);
        }
        foreach (var rental in rentalRows.Where(x => x.Status == CourtRentalStatus.Confirmed).OrderBy(x => x.InvoiceId))
        {
            if (rental.InvoiceItemId is not Guid itemId)
                throw new ConflictException("incident_rental_item_missing", "Lượt thuê đã trả thiếu InvoiceItem.");
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
            var access = await users.GetAsync(rental.ExternalCoachId, ct);
            if (access is not null)
            {
                var source = rental.CourtRentalId;
                var text = pendingIds.Contains(rental.CourtRentalId)
                    ? "Lượt thuê sân đang chờ thanh toán đã hủy do sự cố trung tâm; điểm giữ đã được nhả. Liên hệ Manager để được hỗ trợ ưu tiên đặt lại."
                    : "Lượt thuê sân đã hủy do sự cố trung tâm; 100% giá trị đã trả được hoàn bằng điểm vào ví. Liên hệ Manager để được hỗ trợ ưu tiên đặt lại.";
                notifications.Queue(new NotificationRequest(rental.ExternalCoachId,
                    NotificationEvents.IncidentResolution, text, source));
                notifications.QueueEmail(new EmailNotificationRequest(rental.ExternalCoachId, access.Email,
                    NotificationEvents.IncidentResolution, source, "SportHub - Lịch thuê sân bị hủy",
                    "<p>" + text + "</p>"));
            }
        }

        // Credits/releases follow item→wallet→rental order. Serialize calendar writers afterward,
        // recheck, then let the occupancy exclusion constraint close the final race.
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        EnsureResolvable(impacts);
        if (impacts.Any(x => x.SourceType != nameof(OccupancySourceType.CourtRental)))
            throw new ConflictException("incident_schedule_changed", "Lịch vừa thay đổi sau preview; hãy tải preview mới.");

        var notice = new IncidentNotice
        {
            IncidentId = incidentId, Scope = shape.Scope, RoomId = shape.RoomId,
            StartAtUtc = shape.StartUtc, EndAtUtc = shape.EndUtc,
            Reason = request.Reason.Trim(),
            ResolutionSummary = $"Đã hoàn thuê sân bị ảnh hưởng và khóa {shape.RoomIds.Count} phòng trong khung giờ incident.",
            CreatedByUserId = managerId, CreatedAtUtc = clock.UtcNow
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
                cancelledRentals = rentalRows.Count, blockedRooms = shape.RoomIds.Count
            }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return incidentId;
    }

    private async Task<IncidentShape> ValidateAsync(IncidentRequest request, CancellationToken ct)
    {
        if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<IncidentScope>(request.Scope, true, out var scope) || !Enum.IsDefined(scope))
            throw new BadRequestException("invalid_incident_scope", "Incident scope phải là Room hoặc Center.");
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("incident_reason_required", "Cần nhập lý do incident (3–500 ký tự).");
        var start = DateTime.SpecifyKind(request.StartAtUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.EndAtUtc, DateTimeKind.Utc);
        if (end <= start || end <= clock.UtcNow || end - start > TimeSpan.FromDays(31))
            throw new BadRequestException("invalid_incident_range", "Incident phải còn thời gian ở tương lai và dài tối đa 31 ngày.");
        List<int> roomIds;
        int? roomId = request.RoomId;
        if (scope == IncidentScope.Room)
        {
            if (roomId is null || !await db.Set<Room>().AnyAsync(x => x.RoomId == roomId, ct))
                throw new NotFoundException("incident_room_not_found", "Cần chọn phòng tồn tại cho incident Room.");
            roomIds = [roomId.Value];
        }
        else
        {
            roomId = null;
            roomIds = await db.Set<Room>().AsNoTracking().Where(x => x.IsActive)
                .OrderBy(x => x.RoomId).Select(x => x.RoomId).ToListAsync(ct);
            if (roomIds.Count == 0) throw new ConflictException("incident_no_active_rooms", "Trung tâm chưa có phòng hoạt động để khóa.");
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
            or nameof(OccupancySourceType.PtSession) or nameof(OccupancySourceType.RoomBlock)))
            throw new ConflictException("incident_requires_schedule_resolution",
                "Incident ảnh hưởng lớp/PT/room block. Chọn phương án dời hoặc bù hợp lệ trước; chưa tạo block hoặc hoàn tiền.");
        if (impacts.Any(x => x.SourceType != nameof(OccupancySourceType.CourtRental)))
            throw new ConflictException("incident_source_unsupported", "Có nguồn chiếm lịch chưa hỗ trợ xử lý incident an toàn.");
    }

    private sealed record IncidentShape(IncidentScope Scope, int? RoomId, DateTime StartUtc, DateTime EndUtc, List<int> RoomIds);
}

public sealed record IncidentRequest([property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc, string Reason);
public sealed record IncidentImpact([property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId, DateTime StartAtUtc, DateTime EndAtUtc)
{
    public IReadOnlyList<IncidentResolutionOption> ResolutionOptions => SourceType switch
    {
        "ClassSession" => [new("Reschedule", "POST", $"/api/class-sessions/{SourceId}/reschedule"),
            new("CancelWithMakeup", "POST", $"/api/class-sessions/{SourceId}/cancel")],
        "PtSession" => [new("Reschedule", "POST", $"/api/manager/pt-sessions/{SourceId}/reschedule"),
            new("CancelByCenter", "POST", $"/api/manager/pt-sessions/{SourceId}/cancel")],
        "RoomBlock" => [new("RemoveExistingBlock", "DELETE", $"/api/manager/room-blocks/{SourceId}")],
        "CourtRental" => [new("AutoCancelAndRefundOnResolve", "POST", "/api/manager/incidents/resolve")],
        _ => []
    };
}
public sealed record IncidentResolutionOption(string Action, string Method, string Path);
public sealed record IncidentPreviewResponse([property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc,
    IReadOnlyList<IncidentImpact> Impacts, bool CanResolve, string? BlockReason);
