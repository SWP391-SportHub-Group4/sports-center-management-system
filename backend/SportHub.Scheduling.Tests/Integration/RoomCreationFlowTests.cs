using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Rental.Application;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class RoomCreationFlowTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Rental_sport_selection_controls_member_visibility_and_can_be_changed_in_pricing()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var sportIds = await factory.QueryAsync(async db => {
            var first = new Sport { Code = "rent_" + Guid.NewGuid().ToString("N")[..8], Name = "Rental sport " + Guid.NewGuid(), IsActive = true };
            var second = new Sport { Code = "rent_" + Guid.NewGuid().ToString("N")[..8], Name = "Rental sport " + Guid.NewGuid(), IsActive = true };
            db.Set<Sport>().AddRange(first, second);
            await db.SaveChangesAsync();
            return new[] { first.SportId, second.SportId };
        });
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await manager.PostAsJsonAsync("api/rooms", new {
            name = "Sport-specific court " + Guid.NewGuid(), capacity = 12, allowRental = true,
            rentalSetup = new { sportId = sportIds[0], pricePerHour = 100000,
                hours = Enumerable.Range(0, 7).Select(day => new { dayOfWeek = day, openTimeLocal = "06:00", closeTimeLocal = "22:00" }).ToArray() }
        });
        response.EnsureSuccessStatusCode();
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        var rates = (await manager.GetFromJsonAsync<List<CourtRateResponse>>("api/manager/court-rates"))!;
        var rate = Assert.Single(rates, row => row.RoomId == room.RoomId);
        Assert.Equal(sportIds[0], rate.SportId);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var day = VietnamTime.TodayLocal(new SystemClock()).AddDays(1);
        async Task<CourtCalendarDay> Calendar(int sportId) => (await memberClient.GetFromJsonAsync<CourtCalendarDay>(
            $"api/court-rentals/calendar?sportId={sportId}&date={day:yyyy-MM-dd}"))!;
        Assert.Contains((await Calendar(sportIds[0])).Rooms, row => row.RoomId == room.RoomId);
        Assert.DoesNotContain((await Calendar(3)).Rooms, row => row.RoomId == room.RoomId);

        var update = await manager.PutAsJsonAsync($"api/manager/court-rates/{rate.RateId}", new {
            roomId = room.RoomId, roomTypeId = room.RoomTypeId, sportId = sportIds[1],
            daysOfWeek = rate.DaysOfWeek.Split(','), startTimeLocal = rate.StartTimeLocal,
            endTimeLocal = rate.EndTimeLocal, pricePerHour = rate.PricePerHour, isActive = true
        });
        update.EnsureSuccessStatusCode();
        var changed = (await update.Content.ReadFromJsonAsync<CourtRateResponse>())!;
        Assert.Equal(room.RoomId, changed.RoomId);
        Assert.Equal(room.RoomTypeId, changed.RoomTypeId);
        Assert.Equal(sportIds[1], changed.SportId);
        Assert.Contains((await Calendar(sportIds[1])).Rooms, row => row.RoomId == room.RoomId);
        Assert.DoesNotContain((await Calendar(sportIds[0])).Rooms, row => row.RoomId == room.RoomId);
        using var scope = factory.Services.CreateScope();
        var rentals = scope.ServiceProvider.GetRequiredService<CourtRentalService>();
        var start = new DateTimeOffset(VietnamTime.StartOfDayUtc(day).AddHours(9));
        Assert.NotNull(await rentals.QuoteAsync(new(member.UserId, sportIds[1], room.RoomId, start, start.AddHours(1))));
        await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(new(member.UserId, sportIds[0], room.RoomId, start, start.AddHours(1))));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(int.MaxValue)]
    public async Task Missing_or_invalid_rental_sport_creates_no_room(int? sportId)
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var name = "Invalid rental sport " + Guid.NewGuid();
        var response = await manager.PostAsJsonAsync("api/rooms", new {
            name, capacity = 12, allowRental = true,
            rentalSetup = new { sportId, pricePerHour = 100000,
                hours = new[] { new { dayOfWeek = 1, openTimeLocal = "06:00", closeTimeLocal = "22:00" } } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Rooms.AnyAsync(room => room.Name == name)));
    }

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
    public async Task Rental_room_saves_weekly_hours_and_prices_for_the_selected_sport()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("api/rooms", new {
            name = $"Rental setup {Guid.NewGuid():N}", capacity = 20, allowRental = true,
            rentalSetup = new { sportId = 3, pricePerHour = 120000, hours = Enumerable.Range(0, 7).Select(day => new {
                dayOfWeek = day, openTimeLocal = day == 1 ? "08:00" : "06:00", closeTimeLocal = day == 1 ? "20:00" : "22:00"
            }).ToArray() }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.True(room.IsActive);
        Assert.True(room.AllowRental);
        Assert.Null(room.RentalBookingOpensAtUtc);
        Assert.Null(room.SportId);
        await factory.QueryAsync(async db => {
            Assert.Equal(7, await db.RoomOpeningHours.CountAsync(h => h.RoomId == room.RoomId));
            Assert.Equal(new TimeOnly(8, 0), await db.RoomOpeningHours.Where(h => h.RoomId == room.RoomId && h.DayOfWeek == 1).Select(h => h.OpenTimeLocal).SingleAsync());
            var rates = await db.CourtRates.Where(r => r.RoomId == room.RoomId).ToListAsync();
            Assert.Equal(2, rates.Count);
            Assert.All(rates, rate => { Assert.Equal(3, rate.SportId); Assert.Equal(120000, rate.PricePerHour); Assert.True(rate.IsActive); });
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
            rentalSetup = new { sportId = 3, pricePerHour = price, hours = new[] { new { dayOfWeek = day, openTimeLocal = opens, closeTimeLocal = closes } } } });
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
            rentalSetup = new { sportId = 3, pricePerHour = 100000, hours = Array.Empty<object>() } });
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }
}
