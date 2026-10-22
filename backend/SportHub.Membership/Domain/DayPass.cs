namespace SportHub.Membership.Domain;

/// <summary>Gym access for the local calendar day on which payment succeeds.</summary>
public static class DayPass
{
    public const int PackageId = 50000;

    /// <summary>Vé hết hạn đúng ngần này giờ sau lúc thanh toán thành công.</summary>
    public const int ValidHours = 24;
    /// <summary>Seed default only; the live price is managed in the package catalog.</summary>
    public const decimal PriceVnd = 50_000m;
    public const int DurationDays = 1;
    public const string Name = "Gym day pass";
}
