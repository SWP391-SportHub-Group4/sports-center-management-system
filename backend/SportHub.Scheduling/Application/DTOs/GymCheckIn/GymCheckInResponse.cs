namespace SportHub.Scheduling.Application.DTOs;

public sealed class GymCheckInResponse
{
    public Guid CheckInId { get; init; }
    public Guid MemberId { get; init; }
    public Guid CheckedInByUserId { get; init; }
    public DateTime CheckInTime { get; init; } // UTC

    /// <summary>Thời gian chờ tối thiểu (giây) trước lần check-in kế tiếp của Member, theo system setting.</summary>
    public int CooldownSeconds { get; init; }
}
