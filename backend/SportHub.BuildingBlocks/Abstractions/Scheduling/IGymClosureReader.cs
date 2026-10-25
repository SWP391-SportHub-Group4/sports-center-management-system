namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>Cho module Membership biết Gym có đang đóng cửa vì sự cố hay không (vé Gym 1 ngày không bán khi Gym đóng).</summary>
public interface IGymClosureReader
{
    /// <summary>Join the shared schedule barrier after invoice/wallet locks and before activating a day pass.</summary>
    Task LockForActivationAsync(CancellationToken cancellationToken = default);
    /// <summary>True when every active Gym room is blocked at the supplied instant.</summary>
    Task<bool> IsGymClosedAtAsync(DateTime atUtc, CancellationToken cancellationToken = default);
}
