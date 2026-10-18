using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class ReportSessionIncidentRequest
{
    public Guid FenceId { get; set; }
    [Required] public string Outcome { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; }
    [Required, MinLength(3), MaxLength(500)] public string Reason { get; set; } = string.Empty;
    public CreateMakeupSessionRequest? Makeup { get; set; }
}
