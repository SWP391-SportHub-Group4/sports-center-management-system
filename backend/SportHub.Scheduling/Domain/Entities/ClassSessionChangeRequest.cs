using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Domain.Entities;

public sealed class ClassSessionChangeRequest
{
    public Guid RequestId { get; set; }
    public Guid SessionId { get; set; }
    public ClassSession Session { get; set; } = null!;
    public Guid RequestedByUserId { get; set; }
    public UserAccount RequestedBy { get; set; } = null!;
    public string Type { get; set; } = "SUBSTITUTE";
    public string Reason { get; set; } = "";
    public DateTime? ProposedStartAtUtc { get; set; }
    public DateTime? ProposedEndAtUtc { get; set; }
    public DateTime OriginalStartAtUtc { get; set; }
    public DateTime OriginalEndAtUtc { get; set; }
    public int OriginalRoomId { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string? ReviewNote { get; set; }
    public string? ResolutionType { get; set; }
    public Guid? ResultSessionId { get; set; }
}
