using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class SaveRoomRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(1, 500)]
    public int Capacity { get; set; }

    /// <summary>Loại phòng (BR-108). Null giữ nguyên khi cập nhật; khi tạo mới để trống nghĩa là chưa phân loại.</summary>
    public int? RoomTypeId { get; set; }

    /// <summary>Ngừng/kích hoạt phòng. Null: tạo mới = hoạt động, cập nhật = giữ nguyên. Phòng ngừng chặn booking mới, không đụng lịch cũ.</summary>
    public bool? IsActive { get; set; }
}
