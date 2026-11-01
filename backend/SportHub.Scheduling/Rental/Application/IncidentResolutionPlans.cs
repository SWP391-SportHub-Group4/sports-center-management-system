using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed record IncidentResolutionSelection(Guid SourceId, string Action, string? Reason = null,
    DateTime? StartAtUtc = null, int? RoomId = null, Guid? CoachId = null,
    string? Outcome = null, DateTime? OccurredAtUtc = null);

public sealed partial class IncidentService
{
    private static IReadOnlyList<IncidentResolutionSelection> ValidateResolutionPlans(IncidentRequest request,
        IReadOnlyList<IncidentImpact> impacts)
    {
        var plans = request.Resolutions ?? [];
        if (plans.Select(p => p.SourceId).Distinct().Count() != plans.Count)
            throw new BadRequestException("incident_plan_invalid", "Choose one plan for each affected activity.");
        foreach (var plan in plans)
        {
            var source = impacts.SingleOrDefault(i => i.SourceId == plan.SourceId);
            var allowed = source?.SourceType switch
            {
                nameof(OccupancySourceType.ClassSession) => plan.Action is "RESCHEDULE" or "CANCEL_WITH_MAKEUP" or "SESSION_OUTCOME",
                nameof(OccupancySourceType.RoomBlock) => plan.Action == "REMOVE_ROOM_BLOCK",
                _ => false
            };
            if (!allowed || plan.Action != "REMOVE_ROOM_BLOCK" && (string.IsNullOrWhiteSpace(plan.Reason)
                || plan.Reason.Trim().Length is < 3 or > 500))
                throw new BadRequestException("incident_plan_invalid", "Review a valid plan for each affected activity.");
            if ((plan.Action is "RESCHEDULE" or "CANCEL_WITH_MAKEUP"
                    || plan.Action == "SESSION_OUTCOME" && plan.Outcome != "COMPLETED_AS_PLANNED") && plan.StartAtUtc is null
                || plan.Action == "SESSION_OUTCOME" && (plan.OccurredAtUtc is null
                    || plan.Outcome is not ("INTERRUPTED" or "NOT_HELD" or "COMPLETED_AS_PLANNED")))
                throw new BadRequestException("incident_plan_invalid", "Provide the replacement schedule and session outcome.");
        }
        return plans;
    }

    private async Task ApplyResolutionPlansAsync(IncidentShape shape, IncidentRequest request,
        IReadOnlyList<IncidentResolutionSelection> plans, Guid managerId, CancellationToken ct)
    {
        if (plans.Count == 0) return;
        // A fence exists only inside this confirmation transaction. It is resolved in the same commit,
        // or rolled back together with every schedule change and refund if confirmation fails.
        var fence = await OpenFenceCoreAsync(shape, request, managerId, ct);
        foreach (var plan in plans)
        {
            var makeup = plan.StartAtUtc is DateTime start ? new CreateMakeupSessionRequest
                { StartAtUtc = start, RoomId = plan.RoomId, CoachId = plan.CoachId } : null;
            switch (plan.Action)
            {
                case "RESCHEDULE":
                    await sessions.RescheduleAsync(plan.SourceId, new RescheduleSessionRequest
                        { StartAtUtc = plan.StartAtUtc!.Value, RoomId = plan.RoomId, CoachId = plan.CoachId, Reason = plan.Reason! }, managerId, ct);
                    break;
                case "CANCEL_WITH_MAKEUP":
                    await sessions.CreateIncidentMakeupAsync(plan.SourceId, new IncidentMakeupRequest
                        { FenceId = fence.FenceId, Reason = plan.Reason!, Makeup = makeup! }, managerId, ct);
                    break;
                case "SESSION_OUTCOME":
                    await sessions.ReportIncidentAsync(plan.SourceId, new ReportSessionIncidentRequest
                        { FenceId = fence.FenceId, Reason = plan.Reason!, Outcome = plan.Outcome!,
                            OccurredAtUtc = plan.OccurredAtUtc!.Value, Makeup = makeup }, managerId, ct);
                    break;
                case "REMOVE_ROOM_BLOCK":
                    await new RoomBlockService(db, occupancy, audit, clock).DeleteAsync(plan.SourceId, managerId, ct);
                    break;
            }
        }
    }
}
