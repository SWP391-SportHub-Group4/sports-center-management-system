using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>Lễ tân điểm danh: chỉ Present hoặc Absent. Ghi lần đầu hoặc sửa trong cửa sổ 24 giờ sau khi buổi kết thúc.</summary>
public sealed class MarkAttendanceRequest
{
    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string Status { get; set; } = string.Empty;
}
