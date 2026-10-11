using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

/// <summary>Dời một buổi (giờ/phòng/coach). Ghi danh giữ nguyên; thời lượng không đổi. Chỉ Manager.</summary>
public sealed class RescheduleSessionRequest
{
    [Required]
    public DateTime StartAtUtc { get; set; }

    /// <summary>Null giữ phòng hiện tại.</summary>
    public int? RoomId { get; set; }

    /// <summary>Null giữ coach hiện tại.</summary>
    public Guid? CoachId { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}
