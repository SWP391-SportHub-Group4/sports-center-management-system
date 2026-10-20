using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class CourtRateCalculationTests
{
    [Fact]
    public void Court_specific_prices_override_shared_prices_without_affecting_other_courts()
    {
        var shared = Rate("MON", "08:00", "12:00", 100000);
        var own = Rate("MON", "08:00", "10:00", 80000); own.RoomId = 7;
        var another = Rate("MON", "08:00", "12:00", 200000); another.RoomId = 8;
        var start = new DateTimeOffset(2026,10,5,1,0,0,TimeSpan.Zero);
        Assert.Equal(260000, CourtRateCalculator.Calculate([shared, own, another], 2, start, TimeSpan.FromHours(3), 60, 7).TotalPrice);
        Assert.Equal(600000, CourtRateCalculator.Calculate([shared, own, another], 2, start, TimeSpan.FromHours(3), 60, 8).TotalPrice);
        Assert.Equal(300000, CourtRateCalculator.Calculate([shared, own, another], 2, start, TimeSpan.FromHours(3), 60, 9).TotalPrice);
    }
    [Fact]
    public void CalculatesEachBlockUsingItsVietnameseLocalRate()
    {
        var rates = new[]
        {
            Rate("MON", "08:00", "10:00", 100_000),
            Rate("MON", "10:00", "12:00", 150_000)
        };
        var quote = CourtRateCalculator.Calculate(rates, 2,
            new DateTimeOffset(2026, 10, 5, 1, 0, 0, TimeSpan.Zero), TimeSpan.FromHours(3), 60);
        Assert.Equal(350_000m, quote.TotalPrice);
        Assert.Equal(new[] { 100_000m, 100_000m, 150_000m }, quote.Blocks.Select(x => x.Price));
    }

    [Fact]
    public void RejectsMissingRateForAnyHour()
    {
        var rates = new[] { Rate("MON", "08:00", "09:00", 100_000) };
        var error = Assert.Throws<ConflictException>(() => CourtRateCalculator.Calculate(rates, 2,
            new DateTimeOffset(2026, 10, 5, 1, 0, 0, TimeSpan.Zero), TimeSpan.FromHours(2), 60));
        Assert.Equal("rental_rate_unavailable", error.ErrorCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public void RestrictsRentalDurationToOneThroughFourBlocks(int hours)
    {
        Assert.Throws<BadRequestException>(() => CourtRateCalculator.Calculate([], 2,
            new DateTimeOffset(2026, 10, 5, 1, 0, 0, TimeSpan.Zero), TimeSpan.FromHours(hours), 60));
    }

    private static CourtRate Rate(string days, string start, string end, decimal price)
        => new()
        {
            DaysOfWeek = days, StartTimeLocal = TimeOnly.Parse(start), EndTimeLocal = TimeOnly.Parse(end),
            PricePerHour = price, IsActive = true
        };
}
