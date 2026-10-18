using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Application.Services;

/// <summary>Called inside the schedule transaction, after the class/session locks have been acquired.</summary>
public sealed class ClassScheduleEffects(ISportHubDbContext db, IUserAccessReader users,
    INotificationWriter notifications, IAuditWriter audit, IClock clock)
{
    public async Task ApplyAsync(Class cls, ClassSession session, Guid actorId, Guid oldCoachId,
        Guid resultSessionId, Guid nextCoachId, string message, CancellationToken ct,
        string outcomeAction = "SCHEDULE_UPDATED", string? outcomeReason = null)
    {
        var requests = await db.Set<ClassSessionChangeRequest>()
            .Where(r => r.SessionId == session.SessionId && r.Status == "PENDING")
            .OrderBy(r => r.RequestId).ToListAsync(ct);
        // A request currently being approved is marked RESOLVED in memory by its reviewer.
        foreach (var request in requests.Where(r => r.Status == "PENDING")) {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT request_id FROM class_session_change_requests WHERE request_id = {request.RequestId} FOR UPDATE", ct);
            request.Status = "WITHDRAWN";
            request.ResolutionType = "SCHEDULE_UPDATED";
            request.ReviewedByUserId = actorId;
            request.ReviewedAtUtc = clock.UtcNow;
            request.ReviewNote = "Closed automatically — schedule updated by Manager.";
            request.ResultSessionId = resultSessionId;
            request.OutcomeSnapshotJson = await ClassChangeOutcomeSnapshot.CaptureAsync(db, users,
                resultSessionId, actorId, outcomeAction, outcomeReason ?? message, ct);
            audit.Write(new(actorId, "AUTO_CLOSE_CLASS_SESSION_CHANGE_REQUEST", nameof(ClassSessionChangeRequest), request.RequestId.ToString(),
                OldValue: "{\"status\":\"PENDING\"}", NewValue: JsonSerializer.Serialize(new { request.Status, request.ResolutionType, resultSessionId }),
                Reason: request.ReviewNote));
            await NotifyAsync(request.RequestedByUserId, NotificationEvents.ClassSessionChangeReviewed, request.RequestId,
                $"{cls.Name} · Session {session.SessionNo}: {request.ReviewNote}", ct);
        }
        await NotifyCoachesAsync(cls, oldCoachId, nextCoachId, message, ct);
    }

    // Undo only sends corrections; it must not review unrelated pending requests.
    public Task NotifyCoachesAsync(Class cls, Guid oldCoachId, Guid nextCoachId, string message,
        CancellationToken ct, Guid? eventId = null)
        => NotifyRecipientsAsync(new[] { cls.CoachId, (Guid?)oldCoachId, nextCoachId }
            .Where(id => id.HasValue).Select(id => id!.Value), NotificationEvents.ScheduleChanged,
            eventId ?? Guid.NewGuid(), message, ct);

    public async Task NotifyRecipientsAsync(IEnumerable<Guid> recipients, string type, Guid eventId,
        string message, CancellationToken ct)
    {
        foreach (var userId in recipients.Distinct())
            await NotifyAsync(userId, type, eventId, message, ct);
    }

    private async Task NotifyAsync(Guid userId, string type, Guid source, string message, CancellationToken ct)
    {
        notifications.Queue(new(userId, type, message, source));
        var user = await users.GetAsync(userId, ct);
        if (user is not null) notifications.QueueEmail(new(userId, user.Email, type, source, "SportHub · Teaching schedule updated",
            "<p>" + WebUtility.HtmlEncode(message) + "</p>"));
    }
}
