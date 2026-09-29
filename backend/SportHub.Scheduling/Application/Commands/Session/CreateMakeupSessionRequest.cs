using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>Buổi bù thêm ở cuối lịch. Thời lượng bằng buổi bị hủy; phòng/coach mặc định giữ như buổi bị hủy.</summary>
public sealed class CreateMakeupSessionRequest
{
    [Required]
    public DateTime StartAtUtc { get; set; }

    public int? RoomId { get; set; }

    public Guid? CoachId { get; set; }
}
