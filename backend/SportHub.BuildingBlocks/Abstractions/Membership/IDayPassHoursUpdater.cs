namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>Applies changed center hours to live day passes and pending checkouts in the settings transaction.</summary>
public interface IDayPassHoursUpdater
{
    Task ApplyAsync(int openingMinute, int closingMinute, CancellationToken ct = default);
}
