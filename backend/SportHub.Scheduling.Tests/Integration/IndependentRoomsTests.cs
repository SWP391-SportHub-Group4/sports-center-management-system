using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IndependentRoomsTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData("05:00", "09:00", "MON", false)]
    [InlineData("07:00", "09:00", "MON", false)]
    [InlineData("19:00", "21:00", "MON", false)]
    [InlineData("08:00", "10:00", "TUE", false)]
    [InlineData("08:00", "20:00", "MON", true)]
    public async Task Rental_price_window_respects_rental_and_room_hours(string start, string end, string day, bool allowed)
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var created = await manager.PostAsJsonAsync("api/rooms", new {
            name = $"Price window {Guid.NewGuid():N}", capacity = 12, allowRental = true,
            rentalSetup = new { pricePerHour = 100000, hours = new[] { new { dayOfWeek = 1, openTimeLocal = "08:00", closeTimeLocal = "20:00" } } }
        });
        created.EnsureSuccessStatusCode();
        var room = (await created.Content.ReadFromJsonAsync<RoomResponse>())!;
        // Keep the existing price inactive so the assertion isolates window validation, not overlap checks.
        await factory.QueryAsync(async db => {
            await db.CourtRates.Where(rate => rate.RoomId == room.RoomId).ExecuteUpdateAsync(update => update.SetProperty(rate => rate.IsActive, false));
            return 0;
        });
        var response = await manager.PostAsJsonAsync("api/manager/court-rates", new {
            roomId = room.RoomId, roomTypeId = room.RoomTypeId, sportId = (int?)null,
            daysOfWeek = new[] { day }, startTimeLocal = start, endTimeLocal = end, pricePerHour = 120000, isActive = true
        });
        if (allowed) response.EnsureSuccessStatusCode();
        else Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(allowed ? 2 : 1, await factory.QueryAsync(db => db.CourtRates.CountAsync(rate => rate.RoomId == room.RoomId)));
    }

    [Fact]
    public async Task Inactive_room_can_configure_rental_access_but_cannot_accept_bookings()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await manager.PostAsJsonAsync("api/rooms", new { name = $"Inactive rental {Guid.NewGuid():N}", capacity = 12, isActive = false });
        response.EnsureSuccessStatusCode();
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        var enabled = await manager.PutAsJsonAsync($"api/rooms/{room.RoomId}/rental-access", new { allowRental = true });
        enabled.EnsureSuccessStatusCode();
        var configured = (await enabled.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.True(configured.AllowRental);
        Assert.False(configured.IsActive);
        var start = new DateTimeOffset(VietnamTime.StartOfDayUtc(CourtRentalWindow.AnchorDate(DateTime.UtcNow).AddDays(1)).AddHours(9));
        using var scope = factory.Services.CreateScope();
        var rentals = scope.ServiceProvider.GetRequiredService<CourtRentalService>();
        Assert.Equal("rental_room_incompatible", (await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(
            new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1))))).ErrorCode);
        Assert.DoesNotContain((await rentals.CalendarAsync(member.UserId, 3, DateOnly.FromDateTime(VietnamTime.ToLocal(start.UtcDateTime)), 1, default)).Rooms, r => r.RoomId == room.RoomId);
        var updated = await manager.PutAsJsonAsync($"api/rooms/{room.RoomId}", new { name = room.Name, capacity = 12, isActive = false, allowRental = true });
        updated.EnsureSuccessStatusCode();
        var createdWithBoth = await manager.PostAsJsonAsync("api/rooms", new { name = $"Preconfigured inactive {Guid.NewGuid():N}", capacity = 12, isActive = false, allowRental = true,
            rentalSetup = new { pricePerHour = 100000, hours = new[] { new { dayOfWeek = 1, openTimeLocal = "06:00", closeTimeLocal = "22:00" } } } });
        createdWithBoth.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Create_without_sport_supplies_shared_room_hours_and_defaults_rental_off()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var name = $"New physical room {Guid.NewGuid():N}";
        var response = await manager.PostAsJsonAsync("api/rooms", new { name, capacity = 20 });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.Equal(name, room.Name);
        Assert.Null(room.SportId);
        Assert.False(room.AllowRental);
        Assert.Null(room.RentalBookingOpensAtUtc);
        Assert.Equal(7, await factory.QueryAsync(db => db.RoomOpeningHours.CountAsync(h => h.RoomId == room.RoomId)));
        await factory.QueryAsync(async db =>
        {
            var reader = new SportCatalogReader(db, new SportHub.Administration.Infrastructure.SystemSettingProvider(db));
            Assert.True(await reader.IsRoomCompatibleAsync(room.RoomId, 3));
            Assert.True(await reader.IsRoomCompatibleAsync(room.RoomId, 4));
            return 0;
        });
        var duplicate = await manager.PostAsJsonAsync("api/rooms", new { name, capacity = 20 });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Classes_for_different_sports_can_use_the_same_unassigned_room()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var created = await manager.PostAsJsonAsync("api/rooms", new { name = $"Shared class room {Guid.NewGuid():N}", capacity = 20 });
        created.EnsureSuccessStatusCode();
        var room = (await created.Content.ReadFromJsonAsync<RoomResponse>())!;
        foreach (var sportId in new[] { 3, 4 })
        {
            var request = new SaveClassRequest
            {
                Code = $"SHARED-{Guid.NewGuid():N}", Name = "Shared room class", SportId = sportId,
                DefaultRoomId = room.RoomId, StartDate = CourseTestData.StartDate,
                NumSessions = 1, SessionMinutes = 60, Capacity = 4, Price = 100000, CostAmount = 0,
                ScheduleRules = [new() { DayOfWeek = (int)CourseTestData.StartDate.DayOfWeek, StartTimeLocal = sportId == 3 ? "09:00" : "11:00" }]
            };
            var response = await manager.PostAsJsonAsync("api/manager/classes", request);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
        Assert.Equal(2, await factory.QueryAsync(db => db.Classes.CountAsync(c => c.DefaultRoomId == room.RoomId)));
    }

    [Fact]
    public async Task Rental_opt_in_is_authorized_independent_and_checked_by_quotes()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var response = await manager.PostAsJsonAsync("api/rooms", new { name = $"Rental opt in {Guid.NewGuid():N}", capacity = 12 });
        response.EnsureSuccessStatusCode();
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        var start = new DateTimeOffset(VietnamTime.StartOfDayUtc(CourtRentalWindow.AnchorDate(DateTime.UtcNow).AddDays(1)).AddHours(9));
        var request = new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1));
        using var scope = factory.Services.CreateScope();
        var rentals = scope.ServiceProvider.GetRequiredService<CourtRentalService>();
        var denied = await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(request));
        Assert.Equal("rental_room_incompatible", denied.ErrorCode);

        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PutAsJsonAsync($"api/rooms/{room.RoomId}/rental-access", new { allowRental = true })).StatusCode);
        var enabled = await manager.PutAsJsonAsync($"api/rooms/{room.RoomId}/rental-access", new { allowRental = true });
        enabled.EnsureSuccessStatusCode();
        var updated = (await enabled.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.True(updated.AllowRental);
        Assert.Null(updated.SportId);
        Assert.Equal(room.Name, updated.Name);
        Assert.Equal(room.Capacity, updated.Capacity);
        Assert.NotNull(updated.RentalBookingOpensAtUtc);
        Assert.Equal("rental_court_not_open_yet", (await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(request))).ErrorCode);
        // Advance the opening gate without changing the running test server clock.
        await factory.QueryAsync(async db => {
            var stored = await db.Rooms.SingleAsync(r => r.RoomId == room.RoomId);
            stored.RentalBookingOpensAtUtc = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
            return 0;
        });
        var price = await manager.PostAsJsonAsync("api/manager/court-rates", new {
            roomId = room.RoomId, roomTypeId = updated.RoomTypeId, sportId = 3,
            daysOfWeek = new[] { "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN" },
            startTimeLocal = "06:00", endTimeLocal = "22:00", pricePerHour = 100000, isActive = true
        });
        price.EnsureSuccessStatusCode();
        Assert.NotNull(await rentals.QuoteAsync(request));
        var day = DateOnly.FromDateTime(VietnamTime.ToLocal(start.UtcDateTime));
        Assert.Contains((await rentals.CalendarAsync(member.UserId, 3, day, 1, default)).Rooms, r => r.RoomId == room.RoomId);
        (await manager.PutAsJsonAsync($"api/rooms/{room.RoomId}/rental-access", new { allowRental = false })).EnsureSuccessStatusCode();
        Assert.Equal("rental_room_incompatible", (await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(request))).ErrorCode);
        Assert.DoesNotContain((await rentals.CalendarAsync(member.UserId, 3, day, 1, default)).Rooms, r => r.RoomId == room.RoomId);
        Assert.Equal(1, await factory.QueryAsync(db => db.CourtRates.CountAsync(r => r.RoomId == room.RoomId)));
    }
}
