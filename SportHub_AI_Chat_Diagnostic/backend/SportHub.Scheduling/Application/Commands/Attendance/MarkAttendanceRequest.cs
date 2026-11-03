using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>Coach điểm danh: chỉ Present hoặc Absent, ghi lần đầu hoặc sửa trong 24 giờ sau khi buổi kết thúc. Lễ tân chỉ chỉnh bản ghi đã có khi Member kiến nghị và bắt buộc có Reason (BR-98).</summary>
public sealed class MarkAttendanceRequest
{
    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string Status { get; set; } = string.Empty;

    /// <summary>Lý do chỉnh sửa theo kiến nghị của Member; bắt buộc (3 đến 500 ký tự) khi người gọi là Lễ tân.</summary>
    [MaxLength(500)]
    public string? Reason { get; set; }
}
