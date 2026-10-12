using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Catalog.Domain;

public static class CourtRateCalculator
{
    private static readonly string[] DayCodes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    public static CourtRentalQuote Calculate(IEnumerable<CourtRate> source, int sportId,
        DateTimeOffset startUtc, TimeSpan duration, int slotMinutes)
    {
        if (slotMinutes is not (30 or 60) || duration < TimeSpan.FromHours(1)
            || duration.TotalHours > 4 || duration.TotalMinutes % slotMinutes != 0
            || startUtc.Offset != TimeSpan.Zero || startUtc.Second != 0 || startUtc.Millisecond != 0
            || startUtc.Minute % slotMinutes != 0)
            throw new BadRequestException("invalid_rental_window", "Invalid rental window.");
        var rates = source.ToList();
        var slotCount = checked((int)(duration.TotalMinutes / slotMinutes));
        var blocks = new List<CourtRentalBlockPrice>(slotCount);
        var total = 0m;
        for (var index = 0; index < slotCount; index++)
        {
            var start = startUtc.AddMinutes((long)index * slotMinutes);
            var localStart = VietnamTime.ToLocal(start.UtcDateTime);
            var localEnd = localStart.AddMinutes(slotMinutes);
            var day = DayCodes[(int)localStart.DayOfWeek];
            var rate = rates.SingleOrDefault(x => x.DaysOfWeek.Split(',').Contains(day)
                && x.StartTimeLocal <= TimeOnly.FromDateTime(localStart)
                && x.EndTimeLocal >= TimeOnly.FromDateTime(localEnd));
            if (rate is null)
                throw new ConflictException("rental_rate_unavailable", "Rental rate unavailable.");
            var amount = rate.PricePerHour * slotMinutes / 60m;
            blocks.Add(new CourtRentalBlockPrice(start, start.AddMinutes(slotMinutes), amount));
            total += amount;
        }
        if (total <= 0 || total % 1_000 != 0)
            throw new ConflictException("rental_price_invalid", "Rental price invalid.");
        return new CourtRentalQuote(total, blocks);
    }
}
