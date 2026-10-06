namespace SportHub.BuildingBlocks.Abstractions.Training;

/// <summary>
/// Đọc lịch PT còn hiệu lực (Training sở hữu dữ liệu) để catalog và Identity chặn thay đổi cấu hình
/// khi còn buổi PT tương lai. Chỉ buổi Scheduled bắt đầu sau <paramref name="fromUtc"/> được tính.
/// </summary>
public interface IPersonalTrainingScheduleReader
{
    Task<bool> CoachHasFutureSessionsAsync(Guid coachId, DateTime fromUtc, CancellationToken cancellationToken = default);

    Task<bool> AnyFutureSessionInRoomsAsync(IReadOnlyCollection<int> roomIds, DateTime fromUtc, CancellationToken cancellationToken = default);
}
