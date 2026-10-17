namespace SportHub.Scheduling.Threshold.Domain;

/// <summary>A request for new-course notices, without reserving a seat.</summary>
public sealed class CourseInterest
{
    public Guid CourseInterestId { get; set; }
    public Guid MemberId { get; set; }
    public int SportId { get; set; }
    public int SourceClassId { get; set; }
    public Guid ThresholdResponseId { get; set; }
    public int RefundedPoints { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
}
