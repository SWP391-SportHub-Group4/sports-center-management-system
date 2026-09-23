using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class SaveWorkoutPlanItemRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Exercise { get; set; } = string.Empty;

    [Range(1, 50)]
    public int Sets { get; set; }

    [Range(1, 500)]
    public int Reps { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}
