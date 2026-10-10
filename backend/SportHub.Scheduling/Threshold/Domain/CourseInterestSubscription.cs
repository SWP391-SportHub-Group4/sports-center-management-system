namespace SportHub.Scheduling.Threshold.Domain;

/// <summary>Opt-in to future courses in the same sport after a threshold refund; never reserves a seat.</summary>
public sealed class CourseInterestSubscription
{
    public Guid SubscriptionId { get; set; }
    public Guid ThresholdResponseId { get; set; }
    public Guid MemberId { get; set; }
    public int SourceClassId { get; set; }
    public int SportId { get; set; }
    public int RefundedPoints { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UnsubscribedAtUtc { get; set; }
}
