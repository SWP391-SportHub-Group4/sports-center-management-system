namespace SportHub.Identity.Domain.Entities;

public sealed class AvatarReport
{
    public Guid ReportId { get; set; }
    public Guid TargetUserId { get; set; }
    public Guid ReporterUserId { get; set; }
    public string AvatarUrl { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "OPEN";
    public DateTime CreatedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
}
