using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

/// <summary>Member tự đặt một buổi PT 90 phút bằng quyền lợi của chính mình.</summary>
public sealed class SelfBookPtSessionRequest
{
    [Required]
    public Guid EntitlementId { get; set; }

    [Required]
    public DateTime StartAtUtc { get; set; }

    /// <summary>Phòng chọn từ danh sách khung trống; bỏ trống thì hệ thống gán phòng trống đầu tiên theo tên.</summary>
    public int? RoomId { get; set; }
}
