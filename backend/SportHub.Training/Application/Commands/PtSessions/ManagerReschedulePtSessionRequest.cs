using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class ManagerReschedulePtSessionRequest
{
    [Required]
    public DateTime NewStartAtUtc { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
