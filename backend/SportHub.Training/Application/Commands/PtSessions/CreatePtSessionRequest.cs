using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class CreatePtSessionRequest
{
    [Required]
    public Guid EntitlementId { get; set; }

    [Required]
    public DateTime StartAtUtc { get; set; }

    /// <summary>Phòng tập (tùy chọn). Nếu có: phòng phải active, chơi được môn 1-1 của Coach, đang mở cửa và không bị chiếm.</summary>
    public int? RoomId { get; set; }
}
