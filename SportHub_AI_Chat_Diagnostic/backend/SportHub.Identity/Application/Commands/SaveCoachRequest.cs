using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

/// <summary>Thay toàn bộ chuyên môn của Coach; Bio null giữ nguyên.</summary>
public sealed class UpdateCoachRequest
{
    [MinLength(2), MaxLength(100)]
    public string? FullName { get; set; }

    [PhoneNumber]
    public string? Phone { get; set; }

    [Required, MinLength(1), MaxLength(10)]
    public List<int> SportIds { get; set; } = [];

    [MaxLength(1000)]
    public string? Bio { get; set; }

    [MaxLength(100)]
    public string? Title { get; set; }

    [Range(0, 60)]
    public int? YearsExperience { get; set; }

    [Range(0, 100000)]
    public int? StudentCount { get; set; }

    [MaxLength(1000)]
    public string? Philosophy { get; set; }
}
