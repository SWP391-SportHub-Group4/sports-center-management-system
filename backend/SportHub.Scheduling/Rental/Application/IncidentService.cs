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
public sealed partial class IncidentService(ISportHubDbContext db, IOccupancyService occupancy,
    ICourtRentalFulfillment rentals, ICheckoutLifecycleService checkouts, IRefundCreditService refunds,
    INotificationWriter notifications, IUserAccessReader users, IAuditWriter audit, IClock clock,
    INotificationDeliveryReader delivery, IMembershipClosureExtension membershipExtension, IIncidentDayPassService dayPasses,
    SportHub.Scheduling.Application.Interfaces.IClassSessionService sessions,
    SportHub.BuildingBlocks.Abstractions.Configuration.ISystemSettingProvider settings)
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
        var saved = await db.Set<IncidentNotice>().AsNoTracking().SingleAsync(x => x.IncidentId == incidentId, ct);
        var refundJson = saved.RefundsJson;
        return details with { ClosesGym = saved.ClosesGym, DayPassNoticeSentAtUtc = saved.DayPassNoticeSentAtUtc, DayPassMembers = System.Text.Json.JsonSerializer.Deserialize<List<IncidentDayPassMember>>(saved.DayPassMembersJson) ?? [], Refunds = System.Text.Json.JsonSerializer.Deserialize<List<IncidentRefundReceipt>>(refundJson) ?? [], SessionReports = rows.Select(r => new IncidentSessionHistory(r.SessionId, r.ClassId, r.SessionNo, r.Name,
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
        var receiptJson = await db.Set<IncidentNotice>().Where(i => i.IncidentId == incidentId).Select(i => i.RefundsJson).SingleAsync(ct);
        ids.Add(incidentId);
        ids.AddRange((System.Text.Json.JsonSerializer.Deserialize<List<IncidentRefundReceipt>>(receiptJson) ?? []).Select(r => r.NotificationSourceId));
        return await delivery.GetManyAsync(NotificationEvents.IncidentResolution, ids, ct);
    }

    /// <summary>Review is read-only. No incident or temporary hold exists until confirmation.</summary>
    public async Task<IncidentPreviewResponse> ReviewAsync(IncidentRequest request, Guid managerId, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        await EnsureNoIncidentOverlapAsync(shape, managerId, ct, includeFences: false);
        return await PreviewAsync(request, ct);
    }

    public async Task<IncidentPreviewResponse> PreviewAsync(IncidentRequest request, CancellationToken ct = default)
    {
        var shape = await ValidateAsync(request, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        var plans = ValidateResolutionPlans(request, impacts);
        var needsManual = impacts.Any(x => (x.SourceType is nameof(OccupancySourceType.ClassSession)
            or nameof(OccupancySourceType.RoomBlock)) && !plans.Any(p => p.SourceId == x.SourceId));
        var gymClosed = await ClosesGymAsync(shape, ct);
        var members = await AffectedMembersAsync(impacts, ct);
        var refundRows = await RefundRowsAsync(shape, ct);
        var passMembers = await DayPassMembersAsync(shape, ct);
        var startLocal = DateOnly.FromDateTime(VietnamTime.ToLocal(shape.StartUtc));
        return new IncidentPreviewResponse(shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc,
            impacts, !needsManual, needsManual
                ? "The time slot affects a class or room block. Reschedule or arrange a makeup before blocking the room."
                : null)
        {
            Refunds = refundRows,
            PreviewToken = PreviewFingerprint(shape, refundRows, impacts, passMembers, plans),
            ClosesGym = gymClosed,
            SuggestedMembershipExtensionDays = 0,
            AffectedMemberCount = gymClosed ? await membershipExtension.CountAffectedMembersAsync(startLocal, ct) : 0,
            Members = members.Concat(passMembers.Select(p => new IncidentAffectedMember(p.MemberId, p.MemberName, "GymDayPass", p.PassId, "DayPassSupport", null))).ToList(),
            ExpectedRefundPointsTotal = refundRows.Sum(x => x.SuggestedRefundPoints)
        };
    }

    /// <summary>
    /// Every member the incident touches, with what will happen to them and the points the server expects to credit.
    /// Cancelled rentals are offered a 100% points refund that the Member chooses (or auto-credited after 2 days; same formula as <c>RefundCreditService</c>); class sessions need a
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
        if (request.MembershipExtensionDays is not null and not 0)
            throw new BadRequestException("membership_extension_disabled", "Incidents no longer extend memberships.");
        if (request.OperationId == Guid.Empty)
            throw new BadRequestException("incident_operation_required", "Use a valid incident operation ID.");
        var incidentId = request.OperationId ?? Guid.NewGuid();
        var requestFingerprint = Fingerprint(new { managerId, request });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"incident-refund:{incidentId}"}, 0))", ct);
        var previous = await db.Set<IncidentNotice>().AsNoTracking().SingleOrDefaultAsync(i => i.IncidentId == incidentId, ct);
        if (previous is not null)
        {
            if (previous.CreatedByUserId != managerId || previous.RequestFingerprint != requestFingerprint)
                throw new ConflictException("incident_operation_conflict", "This confirmation has already been used with different details.");
            await tx.CommitAsync(ct);
            return previous.IncidentId;
        }

        if (request.DayPassGifts?.Count > 0)
            throw new BadRequestException("incident_day_pass_compensation_disabled", "Incidents only notify affected Gym day-pass holders; points compensation is not supported.");

        var initialRows = await RefundRowsAsync(shape, ct);
        await refunds.LockBatchAsync(initialRows.Where(r => r.InvoiceItemId.HasValue).Select(r => r.InvoiceItemId!.Value).ToList(),
            initialRows.Where(r => r.InvoiceId != Guid.Empty).Select(r => r.InvoiceId).Distinct().ToList(), ct);
        // Payment locks precede the shared calendar lock, matching checkout and other system refunds.
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        await EnsureNoIncidentOverlapAsync(shape, managerId, ct);
        var impacts = await FindImpactsAsync(shape, ct);
        var plans = ValidateResolutionPlans(request, impacts);
        var rows = await RefundRowsAsync(shape, ct);
        var passMembers = await DayPassMembersAsync(shape, ct);
        if (rows.Any(r => !initialRows.Any(i => i.SourceId == r.SourceId && i.InvoiceItemId == r.InvoiceItemId))
            || ((rows.Count > 0 || plans.Count > 0 || passMembers.Count > 0) && (request.OperationId is null || request.PreviewToken != PreviewFingerprint(shape, rows, impacts, passMembers, plans)))
            || (request.PreviewToken is not null && request.PreviewToken != PreviewFingerprint(shape, rows, impacts, passMembers, plans)))
            throw new ConflictException("incident_refund_preview_changed", "Affected services or refund balances changed. Refresh and review the preview.");
        await ApplyResolutionPlansAsync(shape, request, plans, managerId, ct);
        EnsureResolvable(await FindImpactsAsync(shape, ct));
        var selections = rows.Count == 0 && request.Refunds is null ? [] : Selections(rows, request);
        // Active rental cancellations offer the Member a choice. Keep reviewed historical
        // rental compensation, and do not credit a pending choice on a later incident.
        var choiceRows = rows.Where(r => r.IsPaid && r.SourceType == "CourtRental"
            && (r.Status is nameof(CourtRentalStatus.Confirmed) or nameof(CourtRentalStatus.InUse)
                || (r.Status == nameof(CourtRentalStatus.Cancelled) && r.RefundedPoints == 0))).ToList();
        if (choiceRows.Any(r => selections.Single(s => s.SourceId == r.SourceId).Points != r.SuggestedRefundPoints))
            throw new BadRequestException("incident_refund_points_invalid", "Center-cancelled active rentals offer the full remaining refund value to the Member.");
        var creditedPoints = selections.Where(s => !choiceRows.Any(r => r.SourceId == s.SourceId)).Sum(s => s.Points);
        var notice = new IncidentNotice
        {
            IncidentId = incidentId, Scope = shape.Scope, RoomId = shape.RoomId,
            StartAtUtc = shape.StartUtc, EndAtUtc = shape.EndUtc, Reason = request.Reason.Trim(),
            CreatedByUserId = managerId, CreatedAtUtc = clock.UtcNow,
            RequestFingerprint = requestFingerprint,
            RefundsJson = System.Text.Json.JsonSerializer.Serialize(selections),
            ClosesGym = await ClosesGymAsync(shape, ct),
            DayPassMembersJson = System.Text.Json.JsonSerializer.Serialize(passMembers),
            ResolutionSummary = $"Applied {plans.Count} schedule plans. Reviewed {rows.Count} rental services; refunded {creditedPoints} points and offered a refund choice for {choiceRows.Count} rentals. Listed {passMembers.Select(p => p.MemberId).Distinct().Count()} affected Gym day-pass holders for automatic notification. Affected rentals were cancelled and incident rooms blocked."
        };
        db.Set<IncidentNotice>().Add(notice);
        await db.SaveChangesAsync(ct);
        foreach (var row in rows)
        {
            var selection = selections.Single(s => s.SourceId == row.SourceId);
            var awaitsChoice = choiceRows.Any(r => r.SourceId == row.SourceId);
            var creditNote = "Center incident: " + request.Reason.Trim() + (selection.AdjustmentReason is null ? "" : ". Adjustment: " + selection.AdjustmentReason);
            creditNote = creditNote[..Math.Min(1000, creditNote.Length)];
            if (!row.IsPaid)
            {
                if (row.InvoiceId != Guid.Empty)
                    await checkouts.ReleaseForSystemAsync(row.InvoiceId, "Cancelled", ct);
            }
            else
            {
                if (!awaitsChoice && selection.Points > 0)
                    await refunds.CreditAsync(new RefundCreditRequest(row.InvoiceItemId!.Value, 100,
                        creditNote,
                        incidentId, ExactPoints: selection.Points), ct);
                await rentals.CancelAsync(row.SourceId, request.Reason.Trim(), centerFault: true, incidentId: incidentId, cancellationToken: ct);
                var rental = await db.Set<CourtRental>().SingleAsync(r => r.CourtRentalId == row.SourceId, ct);
                rental.CancellationIncidentId ??= incidentId;
            }
            var recipient = await users.GetAsync(row.MemberId, ct);
            var text = awaitsChoice
                ? $"{row.ServiceName} was cancelled due to a center incident. Choose your refund: receive 100% of the remaining paid value as wallet points, or send a refund request for the Manager. If you do not choose within 2 days, the points are credited automatically. Reason: {request.Reason.Trim()}"
                : row.IsPaid
                ? $"{row.ServiceName} was cancelled due to a center incident. {selection.Points} points were refunded to your wallet. Reason: {request.Reason.Trim()}"
                : $"Your unpaid {row.ServiceName} booking was cancelled due to a center incident. Held points and places were released.";
            notifications.Queue(new NotificationRequest(row.MemberId, NotificationEvents.IncidentResolution, text, selection.NotificationSourceId));
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(row.MemberId, recipient.Email,
                    NotificationEvents.IncidentResolution, selection.NotificationSourceId, "SportHub - Incident resolution", "<p>" + System.Net.WebUtility.HtmlEncode(text) + "</p>"));
        }

        foreach (var roomId in shape.RoomIds.Order())
        {
            // Overlapping incidents share existing incident blocks; reserve only the uncovered gaps.
            var existing = await db.Set<RoomBlock>().AsNoTracking().Where(b => b.RoomId == roomId && b.IncidentId != null
                && b.StartAtUtc < shape.EndUtc && b.EndAtUtc > shape.StartUtc).OrderBy(b => b.StartAtUtc).ToListAsync(ct);
            var cursor = shape.StartUtc;
            var gaps = new List<(DateTime Start, DateTime End)>();
            foreach (var block in existing)
            {
                if (block.StartAtUtc > cursor) gaps.Add((cursor, block.StartAtUtc < shape.EndUtc ? block.StartAtUtc : shape.EndUtc));
                if (block.EndAtUtc > cursor) cursor = block.EndAtUtc;
            }
            if (cursor < shape.EndUtc) gaps.Add((cursor, shape.EndUtc));
            foreach (var gap in gaps.Where(g => g.End > g.Start))
            {
                var block = new RoomBlock { BlockId = Guid.NewGuid(), RoomId = roomId, StartAtUtc = gap.Start, EndAtUtc = gap.End,
                    Reason = request.Reason.Trim(), IncidentId = incidentId, CreatedByUserId = managerId };
                var reserved = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.RoomBlock, block.BlockId,
                    roomId, null, new DateTimeOffset(gap.Start, TimeSpan.Zero), new DateTimeOffset(gap.End, TimeSpan.Zero)), ct);
                if (!reserved.Succeeded) throw new OccupancyConflictException(reserved.Conflicts);
                db.Set<RoomBlock>().Add(block);
            }
        }
        foreach (var fence in await db.Set<IncidentFence>().Where(f => f.Status == IncidentFenceStatus.Open
            && f.Scope == shape.Scope && f.RoomId == shape.RoomId && f.StartAtUtc >= shape.StartUtc && f.EndAtUtc <= shape.EndUtc).ToListAsync(ct))
        {
            fence.Status = IncidentFenceStatus.Resolved; fence.ClosedAtUtc = clock.UtcNow; fence.ResolvedIncidentId = incidentId;
        }
        audit.Write(new AuditEntry(managerId, "RESOLVE_CENTER_INCIDENT", nameof(IncidentNotice), incidentId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { Resolutions = plans, Refunds = selections, TotalPoints = creditedPoints,
                RefundChoices = choiceRows.Select(r => r.SourceId).ToArray() }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct);
        if (passMembers.Count > 0) await SendDayPassNoticeAsync(incidentId, managerId, ct);
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
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var shape = await ValidateAsync(request, ct);
        var fence = await OpenFenceCoreAsync(shape, request, managerId, ct);
        var response = await ToFenceResponseAsync(fence, ct);
        await tx.CommitAsync(ct);
        return response;
    }

    private async Task<IncidentFence> OpenFenceCoreAsync(IncidentShape shape, IncidentRequest request, Guid managerId, CancellationToken ct)
    {
        await EnsureNoIncidentOverlapAsync(shape, managerId, ct);
        var now = clock.UtcNow;
        var fence = await db.Set<IncidentFence>().FirstOrDefaultAsync(f => f.Status == IncidentFenceStatus.Open
            && f.CreatedByUserId == managerId
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
        fence.Reason = request.Reason.Trim();
        fence.ExpiresAtUtc = now + FenceLifetime;
        audit.Write(new AuditEntry(managerId, "OPEN_INCIDENT_FENCE", nameof(IncidentFence), fence.FenceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
                { scope = shape.Scope.ToString(), shape.RoomId, shape.StartUtc, shape.EndUtc, fence.ExpiresAtUtc }),
            Reason: fence.Reason));
        await db.SaveChangesAsync(ct);
        return fence;
    }

    private async Task EnsureNoIncidentOverlapAsync(IncidentShape shape, Guid managerId, CancellationToken ct, bool includeFences = true)
    {
        var now = clock.UtcNow;
        var noticeOverlap = await db.Set<IncidentNotice>().AsNoTracking().AnyAsync(i =>
            i.StartAtUtc < shape.EndUtc && i.EndAtUtc > shape.StartUtc
            && (shape.Scope == IncidentScope.Center || i.Scope == IncidentScope.Center || i.RoomId == shape.RoomId), ct);
        var fenceOverlap = includeFences && await db.Set<IncidentFence>().AsNoTracking().AnyAsync(f =>
            f.Status == IncidentFenceStatus.Open && f.ExpiresAtUtc > now
            && f.StartAtUtc < shape.EndUtc && f.EndAtUtc > shape.StartUtc
            && (shape.Scope == IncidentScope.Center || f.Scope == IncidentScope.Center || f.RoomId == shape.RoomId)
            && !(f.CreatedByUserId == managerId && f.Scope == shape.Scope && f.RoomId == shape.RoomId
                && f.StartAtUtc == shape.StartUtc && f.EndAtUtc == shape.EndUtc), ct);
        if (noticeOverlap || fenceOverlap)
            throw new ConflictException("incident_overlap", "Another incident already covers this room and time. Choose a different room or time.");
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
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var fence = await db.Set<IncidentFence>().SingleOrDefaultAsync(f => f.FenceId == fenceId, ct)
            ?? throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        if (fence.Status != IncidentFenceStatus.Open)
            throw new ConflictException("incident_fence_closed", "This incident is no longer being handled.");
        if (fence.CreatedByUserId != managerId)
            throw new ConflictException("incident_fence_owner", "This incident is being reviewed by another manager.");
        var shape = await ValidateAsync(new(fence.Scope.ToString(), fence.RoomId, fence.StartAtUtc, fence.EndAtUtc, fence.Reason), ct);
        await EnsureNoIncidentOverlapAsync(shape, managerId, ct);
        fence.ExpiresAtUtc = clock.UtcNow + FenceLifetime;
        audit.Write(new AuditEntry(managerId, "EXTEND_INCIDENT_FENCE", nameof(IncidentFence), fenceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { fence.ExpiresAtUtc })));
        await db.SaveChangesAsync(ct);
        var response = await ToFenceResponseAsync(fence, ct);
        await tx.CommitAsync(ct);
        return response;
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
            x.step.Kind != IncidentFenceStepKind.ReviewedCompleted
                && x.step.State == IncidentFenceStepState.Applied && x.step.BeforeStartUtc > now)).ToList();
    }

    /// <summary>
    /// Give up on the incident: release the held window and put every session moved or cancelled during it back where it was.
    /// Each step is reverted only if the session is still exactly as the step left it and the original slot is still free;
    /// the rest are reported, never forced. One transaction, so the release and the reverts commit together.
    /// </summary>
    public async Task<IncidentAbandonResult> AbandonFenceAsync(Guid fenceId, Guid managerId, CancellationToken ct = default)
    {
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var fence = await db.Set<IncidentFence>().SingleOrDefaultAsync(f => f.FenceId == fenceId, ct)
            ?? throw new NotFoundException("incident_fence_not_found", "Incident fence not found.");
        if (fence.Status != IncidentFenceStatus.Open)
            throw new ConflictException("incident_fence_closed", "This incident is no longer being handled.");

        // Release first: the hold would otherwise block sessions from moving back into the window.
        fence.Status = IncidentFenceStatus.Released;
        fence.ClosedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);

        var applied = await db.Set<IncidentFenceStep>().AsNoTracking()
            .Where(s => s.FenceId == fenceId && s.State == IncidentFenceStepState.Applied
                && s.Kind != IncidentFenceStepKind.ReviewedCompleted)
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
        if (tx is not null) await tx.CommitAsync(ct);

        var left = (await ListFenceStepsAsync(fenceId, ct)).Where(s => s.Kind != nameof(IncidentFenceStepKind.ReviewedCompleted)
            && s.State != nameof(IncidentFenceStepState.Undone)).ToList();
        return new IncidentAbandonResult(fenceId, undone, left);
    }

    /// <summary>Discard only the caller's unconfirmed reviews. Confirmed incidents are never changed.</summary>
    public async Task<IReadOnlyList<IncidentAbandonResult>> DiscardDraftsAsync(IReadOnlyList<IncidentDraftReference> references,
        Guid managerId, CancellationToken ct = default)
    {
        if (references.Count == 0) return [];
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: true, ct);
        var candidates = await db.Set<IncidentFence>().Where(f => f.CreatedByUserId == managerId
            && f.Status == IncidentFenceStatus.Open && f.ResolvedIncidentId == null).ToListAsync(ct);
        var matches = candidates.Where(f => references.Any(r => r.FenceId == f.FenceId
            || string.Equals(r.Scope, f.Scope.ToString(), StringComparison.OrdinalIgnoreCase)
                && r.RoomId == f.RoomId && r.StartAtUtc == f.StartAtUtc && r.EndAtUtc == f.EndAtUtc)).ToList();
        var results = new List<IncidentAbandonResult>();
        foreach (var fence in matches) results.Add(await AbandonFenceAsync(fence.FenceId, managerId, ct));
        await tx.CommitAsync(ct);
        return results;
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
                && s.State == IncidentFenceStepState.Applied && s.Kind != IncidentFenceStepKind.ReviewedCompleted, ct));
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
                && (x.SourceType != OccupancySourceType.RoomBlock || !db.Set<RoomBlock>().Any(b => b.BlockId == x.SourceId && b.IncidentId != null))
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
    int? MembershipExtensionDays = null,
    string? PreviewToken = null, Guid? OperationId = null, IReadOnlyList<IncidentRefundSelection>? Refunds = null,
    IReadOnlyList<SportHub.BuildingBlocks.Abstractions.Wallet.IncidentPointGift>? DayPassGifts = null,
    IReadOnlyList<IncidentResolutionSelection>? Resolutions = null);
public sealed record IncidentDraftReference(string Scope, int? RoomId, DateTime StartAtUtc, DateTime EndAtUtc, Guid? FenceId = null);
public sealed record IncidentDetailsResponse(Guid IncidentId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Scope, int? RoomId, string? RoomName,
    DateTime StartAtUtc, DateTime EndAtUtc, string Reason, string ResolutionSummary, DateTime CreatedAtUtc,
    IReadOnlyList<IncidentSessionHistory>? SessionReports = null, IReadOnlyList<IncidentRefundReceipt>? Refunds = null)
{
    public bool ClosesGym { get; init; }
    public DateTime? DayPassNoticeSentAtUtc { get; init; }
    public IReadOnlyList<IncidentDayPassMember> DayPassMembers { get; init; } = [];
}
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
    public Guid? FenceId { get; init; }
    public DateTime? FenceExpiresAtUtc { get; init; }
    public IReadOnlyList<IncidentRefundRow> Refunds { get; init; } = [];
    public string PreviewToken { get; init; } = string.Empty;
    public bool ClosesGym { get; init; }
    public int SuggestedMembershipExtensionDays { get; init; }
    public int AffectedMemberCount { get; init; }

    /// <summary>Per-member outcome and expected refund, so the manager sees who is affected before confirming.</summary>
    public IReadOnlyList<IncidentAffectedMember> Members { get; init; } = [];
    public int ExpectedRefundPointsTotal { get; init; }
}

/// <param name="Outcome">RefundedAsPoints (a 100% points refund is offered to the Member, not credited at resolve) | CheckoutReleased | AwaitsScheduleDecision.</param>
/// <param name="ExpectedRefundPoints">Null when no refund is decided yet (schedule decision pending).</param>
public sealed record IncidentAffectedMember(Guid MemberId, string? MemberName,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Outcome, int? ExpectedRefundPoints);
