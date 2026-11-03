using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Application.Services;

public sealed partial class ClassSessionService
{
    public async Task<ClassSessionResponse> CreateIncidentMakeupAsync(Guid sessionId, IncidentMakeupRequest request,
        Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var session = await LockAndLoadAsync(sessionId, ct);
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);
        var fence = await db.Set<IncidentFence>().FromSqlInterpolated(
            $"SELECT * FROM incident_fences WHERE fence_id={request.FenceId} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (fence is null || fence.Status != IncidentFenceStatus.Open || fence.ExpiresAtUtc <= clock.UtcNow
            || fence.StartAtUtc >= session.EndAtUtc || fence.EndAtUtc <= session.StartAtUtc
            || fence.Scope == IncidentScope.Room && fence.RoomId != session.RoomId)
            throw new ConflictException("incident_window_required", "Hold the matching incident window first.");
        // A retry returns the already created replacement, never another makeup.
        var prior = await db.Set<IncidentFenceStep>().Where(s => s.FenceId == request.FenceId && s.SessionId == sessionId
            && s.Kind == IncidentFenceStepKind.CancelWithMakeup && s.State == IncidentFenceStepState.Applied)
            .FirstOrDefaultAsync(ct);
        if (prior?.MakeupSessionId is Guid replacement)
        {
            if (prior.AfterStartUtc != DateTime.SpecifyKind(request.Makeup.StartAtUtc, DateTimeKind.Utc)
                || prior.AfterRoomId != (request.Makeup.RoomId ?? session.RoomId)
                || prior.AfterCoachId != (request.Makeup.CoachId ?? session.CoachId))
                throw new ConflictException("incident_step_changed", "This incident already has a different replacement. Reload its history.");
            if (tx is not null) await tx.CommitAsync(ct); return await GetAsync(replacement, null, ct);
        }
        EnsureEditable(session, cls);
        if (request.Makeup.StartAtUtc < fence.EndAtUtc)
            throw new BadRequestException("replacement_during_incident", "Choose a replacement after the incident ends.");
        var result = await CancelWithMakeupCoreAsync(sessionId, request, actorUserId, ct, fence.FenceId);
        if (tx is not null) await tx.CommitAsync(ct);
        return result;
    }

    private sealed record StoredIncident(string RequestKey, IncidentSessionReport Report);
    internal static IncidentSessionReport? ReadIncidentReport(string? json)
        => json is null ? null : JsonSerializer.Deserialize<StoredIncident>(json)?.Report;

    public async Task<ClassSessionResponse> ReportIncidentAsync(Guid sessionId, ReportSessionIncidentRequest request,
        Guid actorUserId, CancellationToken ct = default)
    {
        if (request.Outcome is not ("INTERRUPTED" or "NOT_HELD" or "COMPLETED_AS_PLANNED")
            || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("invalid_session_incident", "Choose an outcome and provide a reason with 3–500 characters.");
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var session = await LockAndLoadAsync(sessionId, ct);
        var occurred = DateTime.SpecifyKind(request.OccurredAtUtc, DateTimeKind.Utc);
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
            request.FenceId, request.Outcome, occurred, reason = request.Reason.Trim(), request.Makeup
        }))));
        if (session.IncidentReportJson is not null)
        {
            var stored = JsonSerializer.Deserialize<StoredIncident>(session.IncidentReportJson)!;
            if (stored.RequestKey != key)
                throw new ConflictException("session_incident_already_recorded", "This session already has an incident outcome. Refresh its history.");
            if (tx is not null) await tx.CommitAsync(ct);
            return await GetAsync(stored.Report.ReplacementSessionId ?? sessionId, null, ct);
        }
        var fence = await db.Set<IncidentFence>().FromSqlInterpolated(
            $"SELECT * FROM incident_fences WHERE fence_id={request.FenceId} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (fence is null || fence.Status != IncidentFenceStatus.Open || fence.ExpiresAtUtc <= clock.UtcNow
            || fence.StartAtUtc >= session.EndAtUtc || fence.EndAtUtc <= session.StartAtUtc
            || fence.Scope == IncidentScope.Room && fence.RoomId != session.RoomId)
            throw new ConflictException("incident_window_required", "Hold the matching incident window before recording the outcome.");
        var cls = await db.Set<Class>().SingleAsync(c => c.ClassId == session.ClassId, ct);
        if (cls.Status is not (ClassStatus.Published or ClassStatus.InProgress or ClassStatus.Completed) || session.Status == ClassSessionStatus.Cancelled
            || session.StartAtUtc > clock.UtcNow || occurred > clock.UtcNow
            || occurred < session.StartAtUtc || occurred > session.EndAtUtc
            || occurred < fence.StartAtUtc || occurred > fence.EndAtUtc)
            throw new ConflictException("invalid_incident_session_time", "Choose the actual incident time within this session and incident window. Future sessions use reschedule.");
        if (request.Outcome == "INTERRUPTED" && (occurred <= session.StartAtUtc || occurred >= session.EndAtUtc))
            throw new BadRequestException("invalid_interruption_time", "An interrupted session must have started and not yet finished at the incident time.");

        Guid? replacementId = null;
        if (request.Outcome == "COMPLETED_AS_PLANNED")
        {
            if (session.EndAtUtc > clock.UtcNow || request.Makeup is not null)
                throw new ConflictException("session_not_finished", "A fully delivered session must have finished and needs no replacement.");
            session.Status = ClassSessionStatus.Completed;
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, sessionId, ct);
            await RecordFenceStepAsync(IncidentFenceStepKind.ReviewedCompleted, session, session.StartAtUtc,
                session.EndAtUtc, session.RoomId, session.CoachId, null, session.StartAtUtc, session.RoomId,
                session.CoachId, actorUserId, ct, fence.FenceId);
        }
        else
        {
            if (request.Makeup is null)
                throw new BadRequestException("makeup_required", "Choose a replacement for the whole session.");
            if (request.Makeup.StartAtUtc < fence.EndAtUtc)
                throw new BadRequestException("replacement_during_incident", "Choose a replacement after the incident ends.");
            var reopen = cls.Status == ClassStatus.Completed;
            if (reopen) cls.Status = ClassStatus.InProgress;
            var result = await CancelWithMakeupCoreAsync(sessionId, new CancelSessionRequest {
                Reason = request.Reason.Trim(), Makeup = request.Makeup
            }, actorUserId, ct, fence.FenceId);
            replacementId = result.SessionId;
            if (reopen && cls.CoachId is Guid primaryCoach)
            {
                foreach (var member in await db.Set<Enrollment>().Where(e => e.ClassId == cls.ClassId
                    && e.Status == EnrollmentStatus.Confirmed).Select(e => e.MemberId).Distinct().ToListAsync(ct))
                    await relationships.EnsureClassBasedAsync(primaryCoach, member, cls.ClassId, ct);
            }
        }
        var report = new IncidentSessionReport(fence.FenceId, request.Outcome, occurred, clock.UtcNow,
            actorUserId, request.Reason.Trim(), replacementId);
        session.IncidentReportJson = JsonSerializer.Serialize(new StoredIncident(key, report));
        audit.Write(new AuditEntry(actorUserId, "RECORD_SESSION_INCIDENT", nameof(ClassSession), sessionId.ToString(),
            NewValue: JsonSerializer.Serialize(report), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct);
        if (tx is not null) await tx.CommitAsync(ct);
        return await GetAsync(replacementId ?? sessionId, null, ct);
    }

}
