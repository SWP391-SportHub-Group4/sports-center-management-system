using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

/// <summary>Đổi 29/09/2026 (BE-4): EnrollmentId → PtSessionId.</summary>
public sealed class SaveWorkoutResultRequest
{
    [Required]
    public Guid PtSessionId { get; set; }

    [MaxLength(2000)]
    public string? ProgressNote { get; set; }

    [MaxLength(2000)]
    public string? CoachComment { get; set; }
}
