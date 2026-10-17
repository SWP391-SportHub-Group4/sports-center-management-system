using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.BuildingBlocks.Abstractions.Configuration;

public static class CheckoutHoldPolicy
{
    public const int MinMinutes = 10;
    public const int MaxMinutes = 30;
    public const int DefaultMinutes = 15;

    public static async Task<int> ReadMinutesAsync(ISystemSettingProvider settings, CancellationToken ct)
    {
        var minutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        if (minutes is < MinMinutes or > MaxMinutes)
            throw new ConflictException("hold_setting_invalid", "Hold setting invalid.");
        return minutes;
    }
}
