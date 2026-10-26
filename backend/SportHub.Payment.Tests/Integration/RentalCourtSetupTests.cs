using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class RentalCourtSetupTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Sport_only_setup_creates_a_court_without_user_managed_room_type()
    {
        var template = await RequestAsync();
        var sportId = await factory.QueryAsync(async db => {
            var sport = new Sport {Code = "direct_" + Guid.NewGuid().ToString("N")[..12], Name = "Direct sport " + Guid.NewGuid(), IsActive = true};
            db.Set<Sport>().Add(sport); await db.SaveChangesAsync(); return sport.SportId;
        });
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("/api/rooms/rental", new {template.Name, template.Capacity, sportId, template.Hours, template.Rates});
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var court = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.Null(court.SportId);
        Assert.True(court.AllowRental);
        Assert.True(await factory.QueryAsync(db => db.Set<SportRoomType>().AnyAsync(l => l.SportId == sportId && l.RoomTypeId == court.RoomTypeId)));
        Assert.True(await factory.QueryAsync(db => db.Set<CourtRate>().AnyAsync(r => r.RoomId == court.RoomId && r.SportId == sportId)));
    }

    private async Task<CreateRentalCourtRequest> RequestAsync()
    {
        return await factory.QueryAsync(async db =>
        {
            var sport = new Sport { Code = "setup_" + Guid.NewGuid().ToString("N")[..12], Name = "Setup sport " + Guid.NewGuid(), IsActive = true };
            var type = new RoomType { Name = "Setup type " + Guid.NewGuid(), IsActive = true };
            db.Set<Sport>().Add(sport); db.Set<RoomType>().Add(type);
            await db.SaveChangesAsync();
            db.Set<SportRoomType>().Add(new() { SportId = sport.SportId, RoomTypeId = type.RoomTypeId });
            db.Set<SportServiceOffering>().Add(new() { SportId = sport.SportId, ServiceType = SportServiceType.CourtRental, IsEnabled = false });
            // Existing shared pricing must survive the new court's custom pricing.
            db.Set<CourtRate>().Add(new() { RoomTypeId = type.RoomTypeId, SportId = sport.SportId,
                DaysOfWeek = "SUN,MON,TUE,WED,THU,FRI,SAT", StartTimeLocal = new(6,0), EndTimeLocal = new(22,0), PricePerHour = 200000 });
            await db.SaveChangesAsync();
            return new CreateRentalCourtRequest { Name = "Court " + Guid.NewGuid(), Capacity = 12,
                SportId = sport.SportId, RoomTypeId = type.RoomTypeId,
                Hours = Enumerable.Range(0,7).Select(day => new OpeningHourInput { DayOfWeek = day, OpenTimeLocal = "06:00", CloseTimeLocal = "22:00" }).ToList(),
                Rates = new[] { "SUN","MON","TUE","WED","THU","FRI","SAT" }.Select(day => new SaveCourtRateRequest {
                    DaysOfWeek = [day], StartTimeLocal = "06:00", EndTimeLocal = "22:00", PricePerHour = 100000 }).ToList() };
        });
    }

    [Fact]
    public async Task New_court_blocks_calendar_quotes_and_checkout_until_next_Vietnam_day()
    {
        var request = await RequestAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("/api/rooms/rental", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var room = (await response.Content.ReadFromJsonAsync<RoomResponse>())!;
        var prices = (await client.GetFromJsonAsync<List<CourtRateResponse>>("/api/manager/court-rates"))!;
        var courtPrice = Assert.Single(prices, r => r.RoomId == room.RoomId);
        Assert.Equal(100000, courtPrice.PricePerHour);
        Assert.Equal("MON,TUE,WED,THU,FRI,SAT,SUN", courtPrice.DaysOfWeek);
        Assert.Contains(prices, r => r.RoomId == null && r.RoomTypeId == request.RoomTypeId && r.PricePerHour == 200000);
        var date = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(1); // Trong cửa sổ hôm nay + 2 ngày (đổi lúc 06:00).
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(new SystemClock()).AddDays(1)), room.RentalBookingOpensAtUtc);
        var beforeOpen = (await memberClient.GetFromJsonAsync<CourtCalendarDay>($"/api/court-rentals/calendar?sportId={request.SportId}&date={date:yyyy-MM-dd}&hours=1"))!;
        Assert.DoesNotContain(beforeOpen.Rooms, r => r.RoomId == room.RoomId);
        using (var beforeScope = factory.Services.CreateScope())
        {
            var service = beforeScope.ServiceProvider.GetRequiredService<ICourtRentalFulfillment>();
            var start = VietnamTime.StartOfDayUtc(date).AddHours(9);
            var error = await Assert.ThrowsAsync<ConflictException>(() => service.QuoteAsync(
                new(member.UserId, request.SportId, room.RoomId, new DateTimeOffset(start), new DateTimeOffset(start.AddHours(1)))));
            Assert.Equal("rental_court_not_open_yet", error.ErrorCode);
        }
        // Simulate the booking-open boundary passing without changing hours, prices or sport.
        await factory.QueryAsync(async db => {
            await db.Rooms.Where(r => r.RoomId == room.RoomId).ExecuteUpdateAsync(s =>
                s.SetProperty(r => r.RentalBookingOpensAtUtc, DateTime.UtcNow.AddSeconds(-1)));
            return 0;
        });
        var calendarResponse = await memberClient.GetAsync($"/api/court-rentals/calendar?sportId={request.SportId}&date={date:yyyy-MM-dd}&hours=1");
        Assert.True(calendarResponse.IsSuccessStatusCode, await calendarResponse.Content.ReadAsStringAsync());
        var calendar = (await calendarResponse.Content.ReadFromJsonAsync<CourtCalendarDay>())!;
        var slots = Assert.Single(calendar.Rooms, r => r.RoomId == room.RoomId).Slots;
        var slot = slots.First(s => s.Status == "AVAILABLE");
        Assert.Equal(100000, slot.TotalPrice);
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>().CreateCourtRentalAsync(
            new(member.UserId, request.SportId, room.RoomId, new DateTimeOffset(slot.StartUtc), new DateTimeOffset(slot.EndUtc)),
            Guid.NewGuid().ToString(), member.UserId, default);
        Assert.NotNull(checkout.ResourceHoldId);
        var duplicate = await client.PostAsJsonAsync("/api/rooms/rental", request);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal(7, await factory.QueryAsync(db => db.RoomOpeningHours.CountAsync(h => h.RoomId == room.RoomId)));
    }

    [Fact]
    public async Task Missing_price_coverage_rolls_back_the_entire_setup_and_keeps_rental_disabled()
    {
        var request = await RequestAsync();
        request.Rates[0].EndTimeLocal = "12:00";
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync("/api/rooms/rental", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await factory.QueryAsync(db => db.Rooms.AnyAsync(r => r.Name == request.Name)));
        Assert.False(await factory.QueryAsync(db => db.Set<SportServiceOffering>().Where(o => o.SportId == request.SportId).Select(o => o.IsEnabled).SingleAsync()));
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<CourtRate>().CountAsync(r => r.RoomTypeId == request.RoomTypeId)));
    }

    [Fact]
    public async Task Member_cannot_create_rental_courts()
    {
        var request = await RequestAsync();
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/rooms/rental", request)).StatusCode);
    }

    [Fact]
    public async Task Migration_combines_existing_days_but_preserves_prices_status_scopes_and_quote()
    {
        var request = await RequestAsync();
        var keepId = await factory.QueryAsync(async db =>
        {
            var rates = new[] { "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN" }.Select(day => new CourtRate {
                RoomTypeId = request.RoomTypeId, SportId = request.SportId, DaysOfWeek = day,
                StartTimeLocal = new(6,0), EndTimeLocal = new(22,0), PricePerHour = 100000, IsActive = false }).ToList();
            db.Set<CourtRate>().AddRange(rates);
            await db.SaveChangesAsync();
            return rates.Min(r => r.RateId);
        });
        await factory.QueryAsync(async db => {
            await db.Database.ExecuteSqlRawAsync(SportHub.API.Migrations.ConsolidateCourtRateDays.MergeSql);
            await db.Database.ExecuteSqlRawAsync(SportHub.API.Migrations.ConsolidateCourtRateDays.MergeSql);
            return 0;
        });
        var merged = await factory.QueryAsync(db => db.Set<CourtRate>().AsNoTracking().Where(r => r.RoomTypeId == request.RoomTypeId).ToListAsync());
        Assert.Equal(2, merged.Count);
        var rate = Assert.Single(merged, r => !r.IsActive);
        Assert.Equal(keepId, rate.RateId);
        Assert.Equal("MON,TUE,WED,THU,FRI,SAT,SUN", rate.DaysOfWeek);
        Assert.Equal(100000, rate.PricePerHour);
        var shared = Assert.Single(merged, r => r.IsActive);
        Assert.Equal(200000, shared.PricePerHour);
        var quote = CourtRateCalculator.Calculate(merged, request.SportId,
            new DateTimeOffset(2026,10,19,1,0,0,TimeSpan.Zero), TimeSpan.FromHours(1), 60);
        Assert.Equal(200000, quote.TotalPrice);
    }
}
