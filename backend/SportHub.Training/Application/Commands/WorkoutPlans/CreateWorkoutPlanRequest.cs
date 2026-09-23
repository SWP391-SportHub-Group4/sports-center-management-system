using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class CreateWorkoutPlanRequest
{
    [Required]
    public Guid MemberId { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Goal { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Level { get; set; } = string.Empty;

    [Required, MinLength(1)]
    public List<SaveWorkoutPlanItemRequest> Items { get; set; } = [];
}
