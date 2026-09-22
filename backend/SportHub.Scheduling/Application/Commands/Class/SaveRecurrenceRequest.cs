using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class SaveRecurrenceRequest
{
    /// <summary>Danh sách thứ viết tắt tiếng Anh, phân tách bằng dấu phẩy: MON,WED,FRI.</summary>
    [Required]
    public string DaysOfWeek { get; set; } = string.Empty;

    [Required]
    public TimeOnly StartTimeLocal { get; set; }

    [Required]
    public TimeOnly EndTimeLocal { get; set; }

    [Required]
    public DateOnly EffectiveFrom { get; set; }

    public DateOnly? EffectiveTo { get; set; }
}
