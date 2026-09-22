using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class RescheduleSessionRequest
{
    [Required]
    public DateTime NewStartAtUtc { get; set; }

    [Required]
    public DateTime NewEndAtUtc { get; set; }

    public int? NewRoomId { get; set; }

    public Guid? NewCoachId { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
