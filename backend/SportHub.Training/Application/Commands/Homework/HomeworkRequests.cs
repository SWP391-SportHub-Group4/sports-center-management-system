using System.ComponentModel.DataAnnotations;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Application.Commands;

public sealed class CreateHomeworkRequest
{
    [Required] public Guid MemberId { get; set; }
    public Guid? SourceWorkoutPlanId { get; set; }
    [Required, MinLength(1), MaxLength(200)] public string Title { get; set; } = string.Empty;
    [MaxLength(2000)] public string? CoachNote { get; set; }
    public DateTime DueAt { get; set; }
    [Required, MinLength(1)] public List<SaveHomeworkItemRequest> Items { get; set; } = [];
}

public sealed class UpdateHomeworkRequest
{
    [Required, MinLength(1), MaxLength(200)] public string Title { get; set; } = string.Empty;
    [MaxLength(2000)] public string? CoachNote { get; set; }
    public DateTime DueAt { get; set; }
    [Required, MinLength(1)] public List<SaveHomeworkItemRequest> Items { get; set; } = [];
    [Range(0, int.MaxValue)] public int Version { get; set; }
}

public sealed class SaveHomeworkItemRequest
{
    [Required, MinLength(1), MaxLength(200)] public string Exercise { get; set; } = string.Empty;
    [Range(1, 50)] public int Sets { get; set; }
    [Range(1, 500)] public int Reps { get; set; }
    [MaxLength(500)] public string? Notes { get; set; }
}

public sealed class UpdateMemberHomeworkRequest
{
    public HomeworkAssignmentStatus Status { get; set; }
    [MaxLength(2000)] public string? MemberFeedback { get; set; }
    [Range(0, int.MaxValue)] public int Version { get; set; }
}

public sealed class ReviewHomeworkRequest
{
    [Range(0, int.MaxValue)] public int Version { get; set; }
}
