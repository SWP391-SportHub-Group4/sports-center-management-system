using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.BuildingBlocks.Abstractions.Configuration;

public sealed record CenterOperatingHours(int OpeningMinute, int ClosingMinute)
{
    public string Opens => TimeOnly.MinValue.AddMinutes(OpeningMinute).ToString("HH:mm");
    public string Closes => TimeOnly.MinValue.AddMinutes(ClosingMinute).ToString("HH:mm");

    public static async Task<CenterOperatingHours> ReadAsync(ISystemSettingProvider settings, CancellationToken ct = default)
    {
        var closing = await settings.GetVersionedIntAsync(SystemSettingKeys.CenterClosingMinutes, ct);
        var opening = await settings.GetVersionedIntAsync(SystemSettingKeys.CenterOpeningMinutes, ct);
        if (opening.Value < 0 || closing.Value > 1439 || opening.Value >= closing.Value)
            throw new InvalidOperationException("The center operating hours configuration is invalid.");
        return new(opening.Value, closing.Value);
    }

    public bool Covers(TimeOnly start, TimeOnly end)
        => start < end && start.ToTimeSpan().TotalMinutes >= OpeningMinute && end.ToTimeSpan().TotalMinutes <= ClosingMinute;

    public bool Covers(DateTime startLocal, DateTime endLocal)
        => startLocal.Date == endLocal.Date && Covers(TimeOnly.FromDateTime(startLocal), TimeOnly.FromDateTime(endLocal));

    public void EnsureSession(TimeOnly start, int durationMinutes)
    {
        var minute = start.ToTimeSpan().TotalMinutes;
        if (durationMinutes <= 0 || minute < OpeningMinute || minute + durationMinutes > ClosingMinute)
            ThrowOutside();
    }

    public void EnsureRange(TimeOnly start, TimeOnly end)
    {
        if (!Covers(start, end)) ThrowOutside();
    }

    private void ThrowOutside() => throw new BadRequestException("outside_center_hours",
        $"The entire time range must be within the center opening hours ({Opens}–{Closes}, Vietnam time).");
}
