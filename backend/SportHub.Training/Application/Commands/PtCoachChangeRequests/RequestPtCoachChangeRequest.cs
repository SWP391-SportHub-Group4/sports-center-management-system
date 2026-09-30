using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class RequestPtCoachChangeRequest
{
    [Required]
    public Guid RequestedCoachId { get; set; }

    [Required]
    [MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
