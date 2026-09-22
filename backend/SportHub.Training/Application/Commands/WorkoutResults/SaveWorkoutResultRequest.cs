using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class SaveWorkoutResultRequest
{
    [Required]
    public Guid EnrollmentId { get; set; }

    [MaxLength(2000)]
    public string? ProgressNote { get; set; }

    [MaxLength(2000)]
    public string? CoachComment { get; set; }
}
