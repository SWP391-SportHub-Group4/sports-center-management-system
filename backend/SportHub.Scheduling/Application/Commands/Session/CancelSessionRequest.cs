using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class CancelSessionRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
