namespace SportHub.Scheduling.Application.DTOs;

public sealed class GymCheckInResponse
{
    public Guid CheckInId { get; init; }
    public Guid MemberId { get; init; }
    public Guid CheckedInByUserId { get; init; }
    public DateTime CheckInTime { get; init; } // UTC
}
