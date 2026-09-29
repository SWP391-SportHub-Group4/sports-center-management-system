using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class CreatePtSessionRequest
{
    [Required]
    public Guid EntitlementId { get; set; }

    [Required]
    public DateTime StartAtUtc { get; set; }
}
