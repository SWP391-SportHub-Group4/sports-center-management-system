namespace SportHub.Scheduling.Threshold.Domain;

/// <summary>A refunded member's opt-in to hear about a linked replacement cohort. Never reserves a seat.</summary>
public sealed class CourseInterest
{
    public Guid InterestId { get; set; }
    // Compatibility with the shared course-interest API; InterestId remains the stored key.
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public Guid CourseInterestId { get => InterestId; set => InterestId = value; }
    public Guid MemberId { get; set; }
    public int SportId { get; set; }
    public int SourceClassId { get; set; }
    public Guid ThresholdResponseId { get; set; }
    public int RefundedPoints { get; set; }
    public bool Active { get; set; } = true;
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
