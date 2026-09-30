using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>
/// Hủy một buổi: BẮT BUỘC kèm buổi bù hợp lệ (số buổi thực cung cấp vẫn là NumSessions). Hủy và tạo buổi bù là một transaction:
/// buổi bù xung đột thì buổi cũ không bị hủy.
/// </summary>
public sealed class CancelSessionRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;

    [Required]
    public CreateMakeupSessionRequest Makeup { get; set; } = new();
}
