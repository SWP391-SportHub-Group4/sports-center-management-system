using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class ReviewPtSessionChangeRequest
{
    [MaxLength(500)]
    public string? ReviewNote { get; set; }
}
