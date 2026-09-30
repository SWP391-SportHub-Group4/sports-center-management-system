namespace SportHub.Scheduling.Threshold.Application;

public sealed record WaiveClassThresholdRequest(string Reason);
public sealed record UpdateClassThresholdPricingRequest(decimal Price, decimal CostAmount, string Reason);
