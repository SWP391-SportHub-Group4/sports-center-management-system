namespace SportHub.Scheduling.Rental.Domain;

public enum IncidentFenceStatus { Open = 0, Resolved = 1, Released = 2 }

/// <summary>
/// Held while a manager works through an incident (rescheduling classes, arranging makeups). While Open and unexpired,
/// no NEW booking may overlap the incident window in the affected rooms. It is persisted, so work abandoned halfway can be
/// found again, extended, resolved or released; it also expires on its own so a forgotten fence never blocks rooms forever.
/// </summary>
public sealed class IncidentFence
{
    public Guid FenceId { get; set; }
    public IncidentScope Scope { get; set; }
    public int? RoomId { get; set; }
    public DateTime StartAtUtc { get; set; }
    public DateTime EndAtUtc { get; set; }
    public string Reason { get; set; } = string.Empty;
    public IncidentFenceStatus Status { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
    public Guid? ResolvedIncidentId { get; set; }
}
