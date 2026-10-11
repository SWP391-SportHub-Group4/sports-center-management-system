namespace SportHub.Identity.Domain.Entities;

public sealed class AvatarReport
{
    public Guid ReportId { get; set; }
    public Guid TargetUserId { get; set; }
    public Guid ReporterUserId { get; set; }
    public string AvatarUrl { get; set; } = string.Empty;
    public string? AvatarPublicId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "PENDING";
    public DateTime CreatedAt { get; set; }
    public Guid? ReviewedById { get; set; }
    public DateTime? ReviewedAt { get; set; }
}
