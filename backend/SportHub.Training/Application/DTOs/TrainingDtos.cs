using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.DTOs;

public sealed record CoachMemberRelationshipDto(
    Guid RelationshipId,
    Guid CoachId,
    string CoachName,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    string SourceType,
    int? ClassId,
    string? ClassName,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt);

public sealed class CreateRelationshipRequest
{
    [Required]
    public Guid CoachId { get; set; }

    [Required]
    public Guid MemberId { get; set; }

    /// <summary>
    /// Personal hoặc AssignedByManager. ClassBased do hệ thống tự tạo khi hội viên đăng ký
    /// lớp của HLV đó — không nhận từ API (quyết định C3).
    /// </summary>
    [Required]
    public string SourceType { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed record WorkoutPlanItemDto(Guid ItemId, string Exercise, int Sets, int Reps, string? Notes);

public sealed record WorkoutPlanDto(
    Guid PlanId,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    Guid RelationshipId,
    string Goal,
    string Level,
    DateTime CreatedAt,
    IReadOnlyList<WorkoutPlanItemDto> Items);

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

public sealed record WorkoutResultDto(
    Guid ResultId,
    Guid EnrollmentId,
    Guid SessionId,
    string ClassName,
    DateTime SessionStartAtUtc,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    string? ProgressNote,
    string? CoachComment,
    DateTime RecordedAt);

public sealed class SaveWorkoutResultRequest
{
    [Required]
    public Guid EnrollmentId { get; set; }

    [MaxLength(2000)]
    public string? ProgressNote { get; set; }

    [MaxLength(2000)]
    public string? CoachComment { get; set; }
}
