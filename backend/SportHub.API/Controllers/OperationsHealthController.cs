using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Jobs;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.API.Controllers;

/// <summary>
/// One page for "is the money and messaging machinery keeping up?": background jobs, the notification/email outbox and the
/// payment reconciliation backlog. Counts come from the database (they survive restarts); the job table is in memory and says so.
/// </summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/manager/operations")]
public sealed class OperationsHealthController(SportHubDbContext db, JobHealthRegistry jobs, IClock clock) : ControllerBase
{
    /// <summary>Outbox rows that failed this many times need a person, not another retry.</summary>
    public const int OutboxRetryAlert = 5;
    private static readonly TimeSpan GatewayEventGrace = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan SeatHoldGrace = TimeSpan.FromMinutes(5);

    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken ct)
    {
        var now = clock.UtcNow;

        var jobRows = jobs.Snapshot(now);

        var notifications = db.Notifications.AsNoTracking();
        var outbox = new OutboxHealth(
            Pending: await notifications.CountAsync(n => n.Status == NotificationStatus.Pending, ct),
            // A lease that expired without the row being finished means the dispatcher died mid-send.
            StuckSending: await notifications.CountAsync(n => n.Status == NotificationStatus.Sending
                && n.DispatchLeaseUntilUtc != null && n.DispatchLeaseUntilUtc < now, ct),
            Failed: await notifications.CountAsync(n => n.Status == NotificationStatus.Failed, ct),
            FailedNeedingAttention: await notifications.CountAsync(n => n.Status == NotificationStatus.Failed
                && n.RetryCount >= OutboxRetryAlert, ct),
            OldestRetryingAttemptUtc: await notifications.Where(n => n.Status == NotificationStatus.Pending && n.LastAttemptAt != null)
                .MinAsync(n => n.LastAttemptAt, ct));

        var gatewayCutoff = now - GatewayEventGrace;
        var payments = new PaymentReconciliationHealth(
            GatewayEventsUnprocessed: await db.Set<SportHub.Payment.Domain.Entities.VerifiedGatewayEvent>().AsNoTracking()
                .CountAsync(e => e.ProcessingStatus == "Pending" && e.VerifiedAtUtc < gatewayCutoff, ct),
            GatewayEventsFailed: await db.Set<SportHub.Payment.Domain.Entities.VerifiedGatewayEvent>().AsNoTracking()
                .CountAsync(e => e.ProcessingStatus == "Failed", ct),
            ManualCompensationRequired: await db.Set<SportHub.Payment.Domain.Entities.VerifiedGatewayEvent>().AsNoTracking()
                .CountAsync(e => e.ProcessingStatus == "ManualCompensationRequired", ct),
            AttemptsAwaitingReconciliation: await db.Set<SportHub.Payment.Domain.Entities.PaymentAttempt>().AsNoTracking()
                .CountAsync(a => a.Status == PaymentAttemptStatus.ReconciliationRequired, ct),
            InvoicesFlaggedForReconciliation: await db.Set<SportHub.Payment.Domain.Entities.Invoice>().AsNoTracking()
                .CountAsync(i => i.ReconciliationRequired, ct),
            // Expiry jobs release seats; holds still Active well past expiry mean the job is lagging.
            ExpiredSeatHoldsNotReleased: await db.Set<SportHub.Scheduling.Domain.Entities.SeatHold>().AsNoTracking()
                .CountAsync(h => h.Status == SeatHoldStatus.Active && h.ExpiresAtUtc < now - SeatHoldGrace, ct));

        var unhealthyJobs = jobRows.Count(j => j.Unhealthy);
        var needsAttention = payments.ManualCompensationRequired + payments.GatewayEventsFailed
            + payments.AttemptsAwaitingReconciliation + outbox.FailedNeedingAttention + outbox.StuckSending;
        var status = unhealthyJobs > 0 || payments.GatewayEventsUnprocessed > 0 || payments.ExpiredSeatHoldsNotReleased > 0
            ? "Unhealthy"
            : needsAttention > 0 || outbox.Failed > 0 ? "Degraded" : "Healthy";

        return Ok(new OperationsHealthResponse(status, now, jobs.StartedAtUtc, jobRows, outbox, payments));
    }
}

public sealed record OperationsHealthResponse(string Status, DateTime GeneratedAtUtc, DateTime JobHistorySinceUtc,
    IReadOnlyList<JobSnapshot> Jobs, OutboxHealth Outbox, PaymentReconciliationHealth Payments);

public sealed record OutboxHealth(int Pending, int StuckSending, int Failed, int FailedNeedingAttention,
    DateTime? OldestRetryingAttemptUtc);

public sealed record PaymentReconciliationHealth(int GatewayEventsUnprocessed, int GatewayEventsFailed,
    int ManualCompensationRequired, int AttemptsAwaitingReconciliation, int InvoicesFlaggedForReconciliation,
    int ExpiredSeatHoldsNotReleased);
