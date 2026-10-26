using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Rental.Application;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class RoomCreationFlowTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Non_rental_room_is_active_with_no_prices()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("api/rooms", new { name = $"Room only {Guid.NewGuid():N}", capacity = 24, allowRental = false });
        response.EnsureSuccessStatusCode();
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.True(room.IsActive);
        Assert.False(room.AllowRental);
        Assert.Null(room.SportId);
        Assert.Equal(24, room.Capacity);
        Assert.False(await factory.QueryAsync(db => db.CourtRates.AnyAsync(r => r.RoomId == room.RoomId)));
    }

    [Fact]
    public async Task Rental_room_saves_weekly_hours_and_room_prices_atomically_without_a_sport()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("api/rooms", new {
            name = $"Rental setup {Guid.NewGuid():N}", capacity = 20, allowRental = true,
            rentalSetup = new { pricePerHour = 120000, hours = Enumerable.Range(0, 7).Select(day => new {
                dayOfWeek = day, openTimeLocal = day == 1 ? "08:00" : "06:00", closeTimeLocal = day == 1 ? "20:00" : "22:00"
            }).ToArray() }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.True(room.IsActive);
        Assert.True(room.AllowRental);
        Assert.Null(room.SportId);
        await factory.QueryAsync(async db => {
            Assert.Equal(7, await db.RoomOpeningHours.CountAsync(h => h.RoomId == room.RoomId));
            Assert.Equal(new TimeOnly(8, 0), await db.RoomOpeningHours.Where(h => h.RoomId == room.RoomId && h.DayOfWeek == 1).Select(h => h.OpenTimeLocal).SingleAsync());
            var rates = await db.CourtRates.Where(r => r.RoomId == room.RoomId).ToListAsync();
            Assert.Equal(2, rates.Count);
            Assert.All(rates, rate => { Assert.Null(rate.SportId); Assert.Equal(120000, rate.PricePerHour); Assert.True(rate.IsActive); });
            // Simulate reaching the rental opening date while retaining a bookable slot.
            (await db.Rooms.SingleAsync(r => r.RoomId == room.RoomId)).RentalBookingOpensAtUtc = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        var start = new DateTimeOffset(VietnamTime.StartOfDayUtc(CourtRentalWindow.AnchorDate(DateTime.UtcNow).AddDays(1)).AddHours(9));
        var quote = await scope.ServiceProvider.GetRequiredService<CourtRentalService>().QuoteAsync(new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1)));
        Assert.NotNull(quote);
    }

    [Theory]
    [InlineData(0, 1, "06:00", "22:00")]
    [InlineData(100001, 1, "06:00", "22:00")]
    [InlineData(100000, 1, "22:00", "06:00")]
    [InlineData(100000, 7, "06:00", "22:00")]
    [InlineData(100000, 1, "05:00", "22:00")]
    public async Task Invalid_rental_setup_creates_no_room_or_prices(int price, int day, string opens, string closes)
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var name = $"Invalid rental {Guid.NewGuid():N}";
        var response = await client.PostAsJsonAsync("api/rooms", new { name, capacity = 12, allowRental = true,
            rentalSetup = new { pricePerHour = price, hours = new[] { new { dayOfWeek = day, openTimeLocal = opens, closeTimeLocal = closes } } } });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Rooms.AnyAsync(r => r.Name == name)));
    }

    [Fact]
    public async Task Rental_setup_requires_at_least_one_day_and_price()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("api/rooms", new { name = $"Missing setup {Guid.NewGuid():N}", capacity = 12, allowRental = true });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var empty = await client.PostAsJsonAsync("api/rooms", new { name = $"No days {Guid.NewGuid():N}", capacity = 12, allowRental = true,
            rentalSetup = new { pricePerHour = 100000, hours = Array.Empty<object>() } });
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }
}
