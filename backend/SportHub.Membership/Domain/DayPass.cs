namespace SportHub.Membership.Domain;

/// <summary>Fixed price Gym access for the local calendar day on which payment succeeds.</summary>
public static class DayPass
{
    public const int PackageId = 50000;
    public const decimal PriceVnd = 50_000m;
    public const int DurationDays = 1;
    public const string Name = "Gym day pass";
}
