using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class SaveClassRequest
{
    [Required, MinLength(2), MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>PersonalTraining/Yoga/GroupX — KHÔNG có Gym (Gym đi qua GymCheckIn, BR-64).</summary>
    [Required]
    public string Discipline { get; set; } = string.Empty;

    /// <summary>BR-12 — lớp chỉ tạo được khi đã gán Phòng tập.</summary>
    [Required]
    public int DefaultRoomId { get; set; }

    /// <summary>BR-12 — HLV có thể gán lúc tạo hoặc sau đó, nên nullable.</summary>
    public Guid? DefaultCoachId { get; set; }

    [Range(1, 500)]
    public int Capacity { get; set; }
}
