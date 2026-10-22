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
    INotificationDeliveryReader delivery, IMembershipClosureExtension membershipExtension,
    SportHub.Scheduling.Application.Interfaces.IClassSessionService sessions)
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
    {
        var details = await HistoryQuery(db.Set<IncidentNotice>().AsNoTracking().Where(x => x.IncidentId == incidentId))
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("incident_not_found", "Incident not found.");
        var scope = Enum.Parse<IncidentScope>(details.Scope);
        var rows = await (from step in db.Set<IncidentFenceStep>().AsNoTracking()
            join fence in db.Set<IncidentFence>().AsNoTracking() on step.FenceId equals fence.FenceId
            join session in db.Set<ClassSession>().AsNoTracking() on step.SessionId equals session.SessionId
            where fence.Scope == scope && fence.RoomId == details.RoomId
                && fence.StartAtUtc == details.StartAtUtc && fence.EndAtUtc == details.EndAtUtc && session.IncidentReportJson != null
            select new { session.SessionId, session.ClassId, session.SessionNo, session.Class!.Name, session.IncidentReportJson }).Distinct().ToListAsync(ct);
        return details with { SessionReports = rows.Select(r => new IncidentSessionHistory(r.SessionId, r.ClassId, r.SessionNo, r.Name,
            ClassSessionService.ReadIncidentReport(r.IncidentReportJson)!)).ToList() };
    }

    private IQueryable<IncidentDetailsResponse> HistoryQuery(IQueryable<IncidentNotice> query)
        => from incident in query
           join room in db.Set<Room>().AsNoTracking() on incident.RoomId equals (int?)room.RoomId into rooms
           from room in rooms.DefaultIfEmpty()
           select new IncidentDetailsResponse(incident.IncidentId, incident.Scope.ToString(), incident.RoomId,
               room == null ? null : room.Name, incident.StartAtUtc, incident.EndAtUtc,
               incident.Reason, incident.ResolutionSummary, incident.CreatedAtUtc, null);

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
        var members = await AffectedMembersAsync(impacts, ct);
        var startLocal = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        return new IncidentPreviewResponse(shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc,
            impacts, !needsManual, needsManual
                ? "The time slot affects a class or room block. Reschedule or arrange a makeup before blocking the room."
                : null)
        {
            ClosesGym = gymClosed,
            SuggestedMembershipExtensionDays = gymClosed ? FullClosedDays(shape.StartUtc, shape.EndUtc) : 0,
            AffectedMemberCount = gymClosed ? await membershipExtension.CountAffectedMembersAsync(startLocal, ct) : 0,
            Members = members,
            ExpectedRefundPointsTotal = members.Sum(x => x.ExpectedRefundPoints ?? 0)
        };
    }

    /// <summary>
    /// Every member the incident touches, with what will happen to them and the points the server expects to credit.
    /// Rentals are refunded 100% as points on resolve (same formula as <c>RefundCreditService</c>); class sessions need a
    /// schedule decision first, so they carry no refund quote.
    /// </summary>
    private async Task<IReadOnlyList<IncidentAffectedMember>> AffectedMembersAsync(
        IReadOnlyList<IncidentImpact> impacts, CancellationToken ct)
    {
        var result = new List<IncidentAffectedMember>();
        var rentalIds = impacts.Where(x => x.SourceType == nameof(OccupancySourceType.CourtRental))
            .Select(x => x.SourceId).Distinct().ToList();
        var rentals = rentalIds.Count == 0 ? [] : await db.Set<CourtRental>().AsNoTracking()
            .Where(x => rentalIds.Contains(x.CourtRentalId))
            .Select(x => new { x.CourtRentalId, x.MemberId, x.Status, x.InvoiceItemId }).ToListAsync(ct);
        foreach (var rental in rentals.OrderBy(x => x.CourtRentalId))
        {
            var confirmed = (rental.Status is CourtRentalStatus.Confirmed or CourtRentalStatus.InUse)
                && rental.InvoiceItemId is not null;
            int? points = null;
            if (confirmed)
            {
                var value = await refunds.GetRemainingItemValueVndAsync(rental.InvoiceItemId!.Value, ct);
                points = checked((int)decimal.Floor(value / 1000m));
            }
            result.Add(new IncidentAffectedMember(rental.MemberId, (await users.GetAsync(rental.MemberId, ct))?.FullName,
                nameof(OccupancySourceType.CourtRental), rental.CourtRentalId,
                confirmed ? "RefundedAsPoints" : "CheckoutReleased", points));
        }

        var sessionIds = impacts.Where(x => x.SourceType == nameof(OccupancySourceType.ClassSession))
            .Select(x => x.SourceId).Distinct().ToList();
        if (sessionIds.Count > 0)
        {
            var enrolled = await (from session in db.Set<SportHub.Scheduling.Domain.Entities.ClassSession>().AsNoTracking()
                                  join enrollment in db.Set<SportHub.Scheduling.Domain.Entities.Enrollment>().AsNoTracking()
                                      on session.ClassId equals enrollment.ClassId
                                  where sessionIds.Contains(session.SessionId)
                                        && enrollment.Status == SportHub.Scheduling.Domain.Enums.EnrollmentStatus.Confirmed
                                  select new { session.SessionId, enrollment.MemberId }).ToListAsync(ct);
            foreach (var row in enrolled.OrderBy(x => x.SessionId).ThenBy(x => x.MemberId))
                result.Add(new IncidentAffectedMember(row.MemberId, (await users.GetAsync(row.MemberId, ct))?.FullName,
                    nameof(OccupancySourceType.ClassSession), row.SessionId, "AwaitsScheduleDecision", null));
        }

        return result;
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
        if (shape.EndUtc <= clock.UtcNow && rentalIds.Count > 0)
            throw new ConflictException("past_rental_requires_review", "This historical incident also affects court rentals. Review those rentals separately; no automatic historical refunds were made.");
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
        foreach (var rental in rentalRows.Where(x => x.Status is CourtRentalStatus.Confirmed or CourtRentalStatus.InUse).OrderBy(x => x.InvoiceId))
        {
            if (rental.InvoiceItemId is not Guid itemId)
                throw new ConflictException("incident_rental_item_missing", "Incident rental item missing.");
            await refunds.LockPaidItemAsync(itemId, ct);
        }

        foreach (var rental in rentalRows.Where(x => x.Status is CourtRentalStatus.Confirmed or CourtRentalStatus.InUse))
        {
            var itemId = rental.InvoiceItemId!.Value;
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "CenterFault:" + request.Reason.Trim(), incidentId), ct);
            // CancelAsync saves immediately, before the IncidentNotice row exists, so linking the incident here would
            // violate the foreign key. The link is set below and saved together with the notice.
            await rentals.CancelAsync(rental.CourtRentalId, request.Reason.Trim(), centerFault: true,
                incidentId: null, cancellationToken: ct);
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
        // The incident is now applied as room blocks, so any fence held for this window has done its job.
        foreach (var fence in await db.Set<IncidentFence>().Where(f => f.Status == IncidentFenceStatus.Open
                     && f.Scope == shape.Scope && f.RoomId == shape.RoomId
                     && f.StartAtUtc >= shape.StartUtc && f.EndAtUtc <= shape.EndUtc).ToListAsync(ct))
        {
            fence.Status = IncidentFenceStatus.Resolved;
            fence.ClosedAtUtc = clock.UtcNow;
            fence.ResolvedIncidentId = incidentId;
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

    public static readonly TimeSpan FenceLifetime = TimeSpan.FromHours(2);

    /// <summary>
    /// Start handling an incident: hold the window so nobody books into it while the manager reschedules or arranges makeups.
    /// Idempotent for the same window (it renews the existing fence). The fence survives a closed browser tab and expires by itself.
    /// </summary>
    public async Task<IncidentFenceResponse> OpenFenceAsync(IncidentRequest request, Guid managerId, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        var now = clock.UtcNow;
        var fence = await db.Set<IncidentFence>().FirstOrDefaultAsync(f => f.Status == IncidentFenceStatus.Open
            && f.Scope == shape.Scope && f.RoomId == shape.RoomId
            && f.StartAtUtc == shape.StartUtc && f.EndAtUtc == shape.EndUtc, ct);
        if (fence is null)
        {
            fence = new IncidentFence
            {
                FenceId = Guid.NewGuid(), Scope = shape.Scope, RoomId = shape.RoomId,
                StartAtUtc = shape.StartUtc, EndAtUtc = shape.EndUtc, Reason = request.Reason.Trim(),
                Status = IncidentFenceStatus.Open, CreatedByUserId = managerId, CreatedAtUtc = now
            };
            db.Set<IncidentFence>().Add(fence);
        }
        fence.ExpiresAtUtc = now + FenceLifetime;
        audit.Write(new AuditEntry(managerId, "OPEN_INCIDENT_FENCE", nameof(IncidentFence), fence.FenceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
                { scope = shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc, fence.ExpiresAtUtc }),
            Reason: fence.Reason));
        await db.SaveChangesAsync(ct);
        return await ToFenceResponseAsync(fence, ct);
    }

    /// <summary>Incidents still being handled, with what is left to do, so abandoned work can be picked up again.</summary>
    public async Task<IReadOnlyList<IncidentFenceResponse>> ListOpenFencesAsync(CancellationToken ct = default)
    {
        var fences = await db.Set<IncidentFence>().AsNoTracking().Where(f => f.Status == IncidentFenceStatus.Open)
            .OrderBy(f => f.StartAtUtc).ThenBy(f => f.FenceId).Take(100).ToListAsync(ct);
        var result = new List<IncidentFenceResponse>();
        foreach (var fence in fences) result.Add(await ToFenceResponseAsync(fence, ct));
        return result;
    }

    public async Task<IncidentFenceResponse> ExtendFenceAsync(Guid fenceId, Guid managerId, CancellationToken ct = default)
    {
        var fence = await db.Set<IncidentFence>().SingleOrDefaultAsync(f => f.FenceId == fenceId, ct)
            ?? throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        if (fence.Status != IncidentFenceStatus.Open)
            throw new ConflictException("incident_fence_closed", "This incident is no longer being handled.");
        fence.ExpiresAtUtc = clock.UtcNow + FenceLifetime;
        audit.Write(new AuditEntry(managerId, "EXTEND_INCIDENT_FENCE", nameof(IncidentFence), fenceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { fence.ExpiresAtUtc })));
        await db.SaveChangesAsync(ct);
        return await ToFenceResponseAsync(fence, ct);
    }

    /// <summary>Give the window back without resolving (the incident was a false alarm or is handled elsewhere).</summary>
    public async Task ReleaseFenceAsync(Guid fenceId, Guid managerId, CancellationToken ct = default)
    {
        var fence = await db.Set<IncidentFence>().SingleOrDefaultAsync(f => f.FenceId == fenceId, ct)
            ?? throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        if (fence.Status == IncidentFenceStatus.Released) return;
        if (fence.Status == IncidentFenceStatus.Resolved)
            throw new ConflictException("incident_fence_closed", "This incident was already resolved.");
        fence.Status = IncidentFenceStatus.Released;
        fence.ClosedAtUtc = clock.UtcNow;
        audit.Write(new AuditEntry(managerId, "RELEASE_INCIDENT_FENCE", nameof(IncidentFence), fenceId.ToString()));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>The schedule changes made while this window was held: what abandoning would put back, and what it could not.</summary>
    public async Task<IReadOnlyList<IncidentFenceStepResponse>> ListFenceStepsAsync(Guid fenceId, CancellationToken ct = default)
    {
        if (!await db.Set<IncidentFence>().AnyAsync(f => f.FenceId == fenceId, ct))
            throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        var now = clock.UtcNow;
        var rows = await (from step in db.Set<IncidentFenceStep>().AsNoTracking()
                          join session in db.Set<SportHub.Scheduling.Domain.Entities.ClassSession>().AsNoTracking()
                              on step.SessionId equals session.SessionId into sessionJoin
                          from session in sessionJoin.DefaultIfEmpty()
                          join course in db.Set<SportHub.Scheduling.Domain.Entities.Class>().AsNoTracking()
                              on session.ClassId equals course.ClassId into courseJoin
                          from course in courseJoin.DefaultIfEmpty()
                          join room in db.Set<Room>().AsNoTracking() on step.BeforeRoomId equals room.RoomId
                          where step.FenceId == fenceId
                          orderby step.CreatedAtUtc
                          select new { step, SessionNo = (int?)session.SessionNo, Name = course.Name, RoomName = room.Name })
            .ToListAsync(ct);
        return rows.Select(x => new IncidentFenceStepResponse(x.step.StepId, x.step.Kind.ToString(),
            x.step.Kind == IncidentFenceStepKind.RemoveRoomBlock
                ? string.IsNullOrWhiteSpace(x.step.BlockReason) ? x.RoomName : $"{x.RoomName} - {x.step.BlockReason}"
                : x.Name ?? string.Empty,
            x.SessionNo ?? 0,
            x.step.BeforeStartUtc, x.step.AfterStartUtc, x.step.State.ToString(), x.step.UndoNote,
            x.step.State == IncidentFenceStepState.Applied && x.step.BeforeStartUtc > now)).ToList();
    }

    /// <summary>
    /// Give up on the incident: release the held window and put every session moved or cancelled during it back where it was.
    /// Each step is reverted only if the session is still exactly as the step left it and the original slot is still free;
    /// the rest are reported, never forced. One transaction, so the release and the reverts commit together.
    /// </summary>
    public async Task<IncidentAbandonResult> AbandonFenceAsync(Guid fenceId, Guid managerId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var fence = await db.Set<IncidentFence>().SingleOrDefaultAsync(f => f.FenceId == fenceId, ct)
            ?? throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        if (fence.Status != IncidentFenceStatus.Open)
            throw new ConflictException("incident_fence_closed", "This incident is no longer being handled.");

        // Release first: the hold would otherwise block sessions from moving back into the window.
        fence.Status = IncidentFenceStatus.Released;
        fence.ClosedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);

        var applied = await db.Set<IncidentFenceStep>().AsNoTracking()
            .Where(s => s.FenceId == fenceId && s.State == IncidentFenceStepState.Applied)
            .OrderByDescending(s => s.CreatedAtUtc).Select(s => s.StepId).ToListAsync(ct);
        var undone = 0;
        foreach (var stepId in applied)
        {
            var isBlock = await db.Set<IncidentFenceStep>().AsNoTracking()
                .AnyAsync(s => s.StepId == stepId && s.Kind == IncidentFenceStepKind.RemoveRoomBlock, ct);
            var outcome = isBlock
                ? await UndoRoomBlockRemovalAsync(stepId, managerId, ct)
                : await sessions.UndoIncidentStepAsync(stepId, managerId, ct);
            if (outcome.Undone) undone++;
        }

        audit.Write(new AuditEntry(managerId, "ABANDON_INCIDENT_FENCE", nameof(IncidentFence), fenceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { steps = applied.Count, undone })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var left = (await ListFenceStepsAsync(fenceId, ct)).Where(s => s.State != nameof(IncidentFenceStepState.Undone)).ToList();
        return new IncidentAbandonResult(fenceId, undone, left);
    }

    /// <summary>Recreate a manual room block removed during the incident, under its original id, if its window is still free.</summary>
    private async Task<SportHub.Scheduling.Application.Interfaces.SessionStepUndoOutcome> UndoRoomBlockRemovalAsync(Guid stepId, Guid actorUserId, CancellationToken ct)
    {
        var step = await db.Set<IncidentFenceStep>().SingleAsync(s => s.StepId == stepId, ct);
        if (step.State == IncidentFenceStepState.Undone) return new(true, null);

        async Task<SportHub.Scheduling.Application.Interfaces.SessionStepUndoOutcome> Fail(string note)
        {
            step.State = IncidentFenceStepState.UndoFailed;
            step.UndoNote = note;
            await db.SaveChangesAsync(ct);
            return new(false, note);
        }

        if (step.BeforeEndUtc <= clock.UtcNow) return await Fail("The block time has already passed.");
        var blockId = step.RoomBlockId!.Value;
        if (!await db.Set<Room>().AnyAsync(r => r.RoomId == step.BeforeRoomId, ct))
            return await Fail("The room no longer exists.");
        if (await db.Set<RoomBlock>().AnyAsync(b => b.BlockId == blockId, ct))
            return await Fail("The block already exists again, so it was left as it is.");

        var reserved = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.RoomBlock, blockId,
            step.BeforeRoomId, null, new DateTimeOffset(step.BeforeStartUtc, TimeSpan.Zero),
            new DateTimeOffset(step.BeforeEndUtc, TimeSpan.Zero)), ct);
        if (!reserved.Succeeded) return await Fail("The room is no longer free for the block's original time.");

        db.Set<RoomBlock>().Add(new RoomBlock
        {
            BlockId = blockId, RoomId = step.BeforeRoomId, StartAtUtc = step.BeforeStartUtc, EndAtUtc = step.BeforeEndUtc,
            Reason = step.BlockReason ?? string.Empty, CreatedByUserId = step.BlockCreatedByUserId ?? actorUserId
        });
        audit.Write(new AuditEntry(actorUserId, "UNDO_DELETE_ROOM_BLOCK", nameof(RoomBlock), blockId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
                { roomId = step.BeforeRoomId, startAtUtc = step.BeforeStartUtc, endAtUtc = step.BeforeEndUtc, reason = step.BlockReason }),
            Reason: "Incident abandoned"));
        step.State = IncidentFenceStepState.Undone;
        step.UndoneAtUtc = clock.UtcNow;
        step.UndoNote = null;
        await db.SaveChangesAsync(ct);
        return new(true, null);
    }

    private async Task<IncidentFenceResponse> ToFenceResponseAsync(IncidentFence fence, CancellationToken ct)
    {
        var roomIds = fence.Scope == IncidentScope.Room && fence.RoomId is int roomId
            ? [roomId]
            : await db.Set<Room>().AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.RoomId)
                .Select(x => x.RoomId).ToListAsync(ct);
        var shape = new IncidentShape(fence.Scope, fence.RoomId, fence.StartAtUtc, fence.EndAtUtc, roomIds);
        var impacts = await FindImpactsAsync(shape, ct);
        var members = await AffectedMembersAsync(impacts, ct);
        var roomName = fence.RoomId is int id
            ? await db.Set<Room>().AsNoTracking().Where(x => x.RoomId == id).Select(x => x.Name).SingleOrDefaultAsync(ct)
            : null;
        var expired = fence.Status == IncidentFenceStatus.Open
            && fence.ExpiresAtUtc <= clock.UtcNow;
        var needsManual = impacts.Any(x => x.SourceType is nameof(OccupancySourceType.ClassSession)
            or nameof(OccupancySourceType.RoomBlock));
        return new IncidentFenceResponse(fence.FenceId, fence.Scope.ToString(), fence.RoomId, roomName, fence.StartAtUtc,
            fence.EndAtUtc, fence.Reason, fence.CreatedAtUtc, fence.ExpiresAtUtc, expired, impacts.Count,
            members.Select(x => x.MemberId).Distinct().Count(), !needsManual,
            await db.Set<IncidentFenceStep>().AsNoTracking().CountAsync(s => s.FenceId == fence.FenceId
                && s.State == IncidentFenceStepState.Applied, ct));
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
        if (end <= start || end - start > TimeSpan.FromDays(31))
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
    DateTime StartAtUtc, DateTime EndAtUtc, string Reason, string ResolutionSummary, DateTime CreatedAtUtc,
    IReadOnlyList<IncidentSessionHistory>? SessionReports = null);
public sealed record IncidentSessionHistory(Guid SessionId, int ClassId, int SessionNo, string ClassName,
    SportHub.Scheduling.Application.DTOs.IncidentSessionReport Report);
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
/// <param name="IsExpired">The hold lapsed (or the window passed): bookings are allowed again until it is extended.</param>
/// <param name="RemainingImpacts">Activities still inside the window, re-read now.</param>
public sealed record IncidentFenceResponse(Guid FenceId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, string? RoomName,
    DateTime StartAtUtc, DateTime EndAtUtc, string Reason, DateTime CreatedAtUtc, DateTime ExpiresAtUtc,
    bool IsExpired, int RemainingImpacts, int AffectedMemberCount, bool CanResolve, int AppliedSteps);

/// <param name="CanUndo">Applied and the original time is still ahead; undo still checks the session was not changed again.</param>
public sealed record IncidentFenceStepResponse(Guid StepId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Kind,
    string ClassName, int SessionNo, DateTime BeforeStartUtc, DateTime AfterStartUtc,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string State, string? UndoNote, bool CanUndo);

public sealed record IncidentAbandonResult(Guid FenceId, int Undone, IReadOnlyList<IncidentFenceStepResponse> NotUndone);
public sealed record IncidentResolutionOption(string Action, string Method, string Path);
public sealed record IncidentPreviewResponse([property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc,
    IReadOnlyList<IncidentImpact> Impacts, bool CanResolve, string? BlockReason)
{
    public bool ClosesGym { get; init; }
    public int SuggestedMembershipExtensionDays { get; init; }
    public int AffectedMemberCount { get; init; }

    /// <summary>Per-member outcome and expected refund, so the manager sees who is affected before confirming.</summary>
    public IReadOnlyList<IncidentAffectedMember> Members { get; init; } = [];
    public int ExpectedRefundPointsTotal { get; init; }
}

/// <param name="Outcome">RefundedAsPoints | CheckoutReleased | AwaitsScheduleDecision.</param>
/// <param name="ExpectedRefundPoints">Null when no refund is decided yet (schedule decision pending).</param>
public sealed record IncidentAffectedMember(Guid MemberId, string? MemberName,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Outcome, int? ExpectedRefundPoints);
