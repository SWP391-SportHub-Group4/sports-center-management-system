namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>Cho module Membership biết Gym có đang đóng cửa vì sự cố hay không (vé Gym 1 ngày không bán khi Gym đóng).</summary>
public interface IGymClosureReader
{
    /// <summary>True khi có phòng Gym đang hoạt động và mọi phòng Gym đều có RoomBlock bao trùm thời điểm <paramref name="atUtc"/>.</summary>
    Task<bool> IsGymClosedAtAsync(DateTime atUtc, CancellationToken cancellationToken = default);
}
