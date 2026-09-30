using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class CourtRateCalculationTests
{
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
