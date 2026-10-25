namespace SportHub.Scheduling.Rental.Domain;

public enum IncidentScope { Room, Center }

public sealed class IncidentNotice
{
    public Guid IncidentId { get; set; }
    public IncidentScope Scope { get; set; }
    public int? RoomId { get; set; }
    public DateTime StartAtUtc { get; set; }
    public DateTime EndAtUtc { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string RefundsJson { get; set; } = "[]";
    public string? RequestFingerprint { get; set; }
    public string ResolutionSummary { get; set; } = string.Empty;
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    /// <summary>Số ngày Membership Active được gia hạn vì Gym đóng cửa (BR-138); 0 = không gia hạn.</summary>
    public int MembershipExtensionDays { get; set; }

    public int ExtendedMemberCount { get; set; }
}
