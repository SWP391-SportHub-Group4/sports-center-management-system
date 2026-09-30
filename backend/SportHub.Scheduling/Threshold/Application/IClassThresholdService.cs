namespace SportHub.Scheduling.Threshold.Application;

public interface IClassThresholdService
{
    Task<int> EvaluateDueAsync(CancellationToken cancellationToken = default);
    Task WaiveAsync(int classId, Guid managerUserId, string reason, CancellationToken cancellationToken = default);
    Task UpdatePricingAsync(int classId, decimal price, decimal costAmount, Guid managerUserId,
        string reason, CancellationToken cancellationToken = default);
}
