namespace SportHub.Scheduling.Threshold.Domain;

/// <summary>A refunded member's opt-in to hear about a linked replacement cohort. Never reserves a seat.</summary>
public sealed class CourseInterest
{
    public Guid InterestId { get; set; }
    public Guid MemberId { get; set; }
    public int SourceClassId { get; set; }
    public Guid ThresholdResponseId { get; set; }
    public int RefundedPoints { get; set; }
    public bool Active { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
}

public sealed class CourseInterestDelivery
{
    public Guid DeliveryId { get; set; }
    public Guid InterestId { get; set; }
    public int ClassId { get; set; }
    public DateTime QueuedAtUtc { get; set; }
}
