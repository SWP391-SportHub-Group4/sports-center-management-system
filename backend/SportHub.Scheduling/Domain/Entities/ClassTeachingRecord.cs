namespace SportHub.Scheduling.Domain.Entities;

/// <summary>Class teaching content; PT plans/results remain in the Training domain.</summary>
public sealed class ClassTeachingRecord
{
    public Guid RecordId { get; set; }
    public int ClassId { get; set; }
    public Guid? SessionId { get; set; }
    public Guid? MemberId { get; set; }
    public Guid CoachId { get; set; }
    public string Kind { get; set; } = "PLAN";
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int? Score { get; set; }
    public DateTime? DueAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public int Version { get; set; }
}
