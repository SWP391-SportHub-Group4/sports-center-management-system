using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>
/// Hủy khóa và hoàn điểm qua transaction. PreviewToken kiểm tra lại phạm vi/điểm đã xác nhận.
/// </summary>
public sealed class CancelClassRequest
{
    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
    public string? PreviewToken { get; set; }
}
