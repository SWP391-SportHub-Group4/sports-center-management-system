using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Domain.Entities;

/// <summary>
/// Khóa học theo môn nhóm (BR-12, 111, 113, 116, 118, 119). Member mua CẢ khóa, không đặt từng buổi. Sĩ số thuộc lớp:
/// <see cref="ReservedCount"/> = ghi danh Confirmed + giữ chỗ Active và là chốt chặn overbooking (tăng bằng UPDATE có điều kiện).
/// </summary>
public class Class
{
    public int ClassId { get; set; }

    /// <summary>Mã duy nhất, ví dụ CAULONG-01.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Tên hiển thị, ví dụ "Cầu lông 01".</summary>
    public string Name { get; set; } = string.Empty;

    public int SportId { get; set; }

    public Sport? Sport { get; set; }

    /// <summary>Bắt buộc trước khi publish; phải có chuyên môn đúng môn. Cross-module: chỉ scalar, FK cấu hình ở host.</summary>
    public Guid? CoachId { get; set; }

    public int DefaultRoomId { get; set; }

    public Room? DefaultRoom { get; set; }

    /// <summary>Ngày buổi đầu (giờ VN).</summary>
    public DateOnly StartDate { get; set; }

    public int NumSessions { get; set; }

    public int Capacity { get; set; }

    /// <summary>Giá cả khóa (VND, dương, bội số 1.000).</summary>
    public decimal Price { get; set; }

    /// <summary>Chi phí do Manager nhập tay (BR-118) để tính ngưỡng hoàn vốn.</summary>
    public decimal CostAmount { get; set; }

    /// <summary>ceil(cost/price), snapshot khi publish.</summary>
    public int? BreakEvenThreshold { get; set; }

    public ThresholdStatus ThresholdStatus { get; set; }

    /// <summary>Giờ bắt đầu buổi đầu trừ N ngày (cấu hình <c>class.threshold_days_before_start</c>).</summary>
    public DateTime? ThresholdDeadlineUtc { get; set; }

    public DateTime? ThresholdResponseDeadlineUtc { get; set; }

    public ClassStatus Status { get; set; }

    /// <summary>Số ghi danh Confirmed.</summary>
    public int ConfirmedCount { get; set; }

    /// <summary>ConfirmedCount + số SeatHold Active. Luôn 0 ≤ Confirmed ≤ Reserved ≤ Capacity.</summary>
    public int ReservedCount { get; set; }

    public bool CreatedByAi { get; set; }

    /// <summary>Token đồng thời cho các thay đổi cấu trúc (soạn, publish, sửa giá/chi phí).</summary>
    public int Version { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? PublishedAt { get; set; }

    public ICollection<ClassScheduleRule> ScheduleRules { get; set; } = new List<ClassScheduleRule>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}
