using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class CreateAdHocSessionRequest
{
    [Required]
    public int ClassId { get; set; }

    [Required]
    public DateTime StartAtUtc { get; set; }

    [Required]
    public DateTime EndAtUtc { get; set; }

    /// <summary>Null = dùng phòng/HLV mặc định của lớp.</summary>
    public int? RoomId { get; set; }

    public Guid? CoachId { get; set; }
}
