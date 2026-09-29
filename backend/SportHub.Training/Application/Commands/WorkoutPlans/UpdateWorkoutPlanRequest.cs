using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class UpdateWorkoutPlanRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Goal { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Level { get; set; } = string.Empty;

    [Required, MinLength(1)]
    public List<SaveWorkoutPlanItemRequest> Items { get; set; } = [];

    [Range(0, int.MaxValue)]
    public int Version { get; set; }
}
