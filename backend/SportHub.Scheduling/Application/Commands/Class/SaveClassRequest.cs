using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>Một quy tắc lịch lặp: thứ trong tuần + giờ bắt đầu địa phương (HH:mm). Thời lượng lấy từ môn.</summary>
public sealed class ScheduleRuleInput
{
    /// <summary>0 = Chủ nhật … 6 = Thứ bảy.</summary>
    [Range(0, 6)]
    public int DayOfWeek { get; set; }

    [Required]
    public string StartTimeLocal { get; set; } = string.Empty;
}

/// <summary>Soạn/sửa khóa học ở trạng thái Draft. Chỉ Manager. Giá/chi phí/sĩ số do backend kiểm, không tin client.</summary>
public sealed class SaveClassRequest
{
    [Required, MinLength(2), MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MinLength(1), MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    public int SportId { get; set; }

    /// <summary>Bắt buộc trước khi publish; phải có chuyên môn khớp môn.</summary>
    public Guid? CoachId { get; set; }

    public int DefaultRoomId { get; set; }

    /// <summary>Ngày buổi đầu (giờ VN).</summary>
    public DateOnly StartDate { get; set; }

    public int NumSessions { get; set; }

    public int Capacity { get; set; }

    public decimal Price { get; set; }

    public decimal CostAmount { get; set; }

    [Required, MinLength(1), MaxLength(14)]
    public List<ScheduleRuleInput> ScheduleRules { get; set; } = [];
}
