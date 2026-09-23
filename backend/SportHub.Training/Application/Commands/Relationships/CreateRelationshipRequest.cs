using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

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
