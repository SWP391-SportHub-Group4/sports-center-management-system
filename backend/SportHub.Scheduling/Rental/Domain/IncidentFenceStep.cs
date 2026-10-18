namespace SportHub.Scheduling.Rental.Domain;

public enum IncidentFenceStepKind { Reschedule = 0, CancelWithMakeup = 1, RemoveRoomBlock = 2 }

public enum IncidentFenceStepState { Applied = 0, Undone = 1, UndoFailed = 2 }

/// <summary>
/// A schedule change made while an incident window was held (a session moved, or cancelled with a makeup). It records how the
/// session looked before and right after, so abandoning the incident can put things back, and can tell when someone has
/// changed the session since and the step is no longer safe to revert.
/// </summary>
public sealed class IncidentFenceStep
{
    public Guid StepId { get; set; }
    public Guid FenceId { get; set; }
    public IncidentFenceStepKind Kind { get; set; }
    /// <summary>The session that was changed; null for <see cref="IncidentFenceStepKind.RemoveRoomBlock"/>.</summary>
    public Guid? SessionId { get; set; }

    /// <summary>The manual room block removed during the incident. Its room and window are kept in the Before* columns
    /// so undo can recreate it under the same id.</summary>
    public Guid? RoomBlockId { get; set; }
    public string? BlockReason { get; set; }
    public Guid? BlockCreatedByUserId { get; set; }

    /// <summary>The makeup session created by <see cref="IncidentFenceStepKind.CancelWithMakeup"/>.</summary>
    public Guid? MakeupSessionId { get; set; }

    public DateTime BeforeStartUtc { get; set; }
    public DateTime BeforeEndUtc { get; set; }
    public int BeforeRoomId { get; set; }
    public Guid BeforeCoachId { get; set; }

    /// <summary>Where the session (or its makeup) ended up; undo only proceeds while it is still there.</summary>
    public DateTime AfterStartUtc { get; set; }
    public int AfterRoomId { get; set; }
    public Guid AfterCoachId { get; set; }

    public Guid ActorUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public IncidentFenceStepState State { get; set; }
    public DateTime? UndoneAtUtc { get; set; }

    /// <summary>Why a revert was not possible, in words a manager can act on.</summary>
    public string? UndoNote { get; set; }
}
