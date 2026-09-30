using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class NoShowPtSessionRequest
{
    [MaxLength(500)]
    public string? Reason { get; set; }
}
