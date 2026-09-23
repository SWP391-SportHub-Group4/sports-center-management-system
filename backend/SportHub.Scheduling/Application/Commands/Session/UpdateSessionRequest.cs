namespace SportHub.Scheduling.Application.Commands;

public sealed class UpdateSessionRequest
{
    public int? RoomId { get; set; }

    public Guid? CoachId { get; set; }

    /// <summary>BR-51 — chỉ được giảm, không vượt trần tại thời điểm tạo buổi.</summary>
    public int? Capacity { get; set; }
}
