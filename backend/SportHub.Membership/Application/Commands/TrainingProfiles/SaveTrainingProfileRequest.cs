using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Application.Commands;

public sealed class SaveTrainingProfileRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Goal { get; set; } = string.Empty;

    /// <summary>Tên member của enum ExperienceLevel (SSOT §3): Beginner/Intermediate/Advanced.</summary>
    [Required]
    public string ExperienceLevel { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Notes { get; set; }
}
