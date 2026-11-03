namespace SportHub.Scheduling.Threshold.Domain;

/// <summary>One private, expiring decision link per paid enrollment affected by an AtRisk class.</summary>
public sealed class ThresholdResponse
{
    public Guid ThresholdResponseId { get; set; }
    public int ClassId { get; set; }
    public Guid EnrollmentId { get; set; }
    public Guid MemberId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime DeadlineUtc { get; set; }
    public ThresholdResponseChoice? Choice { get; set; }
    public int? TargetClassId { get; set; }
    public ThresholdResolutionStatus ResolutionStatus { get; set; }
    public Guid? AdditionalInvoiceId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? RespondedAtUtc { get; set; }
    public DateTime? ResolvedAtUtc { get; set; }
}
