using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class ReviewPtCoachChangeRequest
{
    [MaxLength(500)]
    public string? ReviewNote { get; set; }
}
