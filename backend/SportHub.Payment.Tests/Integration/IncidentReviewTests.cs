using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class IncidentReviewTests(PaymentApiFactory factory)
{
    private static readonly DateOnly Day = VietnamTime.TodayLocal(new SystemClock()).AddDays(1);
    private static DateTime At(int hour, int minute = 0) => VietnamTime.StartOfDayUtc(Day).AddHours(hour).AddMinutes(minute);

    private async Task<int> Room()
        => await factory.QueryAsync(async db => {
            var room = new Room { Name = "Review " + Guid.NewGuid(), Capacity = 12, RoomTypeId = 3, AllowRental = true, IsActive = true };
            db.Rooms.Add(room); await db.SaveChangesAsync();
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(d => new RoomOpeningHour {
                RoomId = room.RoomId, DayOfWeek = d, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            if (!await db.Set<CourtRate>().AnyAsync(r => r.RoomTypeId == 3))
                db.Set<CourtRate>().Add(new CourtRate { RoomTypeId = 3, SportId = 3, DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN",
                    StartTimeLocal = new(6, 0), EndTimeLocal = new(22, 0), PricePerHour = 100000, IsActive = true });
            await db.SaveChangesAsync(); return room.RoomId;
        });

    private static IncidentRequest Request(int room, DateTime? start = null, DateTime? end = null)
        => new("ROOM", room, start ?? At(10), end ?? At(11), "Repair court surface");

    private static async Task Error(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Review_automatically_locks_bookings_reuses_own_window_and_resolve_stays_idempotent()
    {
        var room = await Room();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = Request(room);
        var response = await client.PostAsJsonAsync("/api/manager/incidents/preview", request);
        response.EnsureSuccessStatusCode();
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        (await client.PostAsJsonAsync("/api/manager/incidents/preview", request)).EnsureSuccessStatusCode();
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<IncidentFence>().CountAsync(f => f.RoomId == room && f.Status == IncidentFenceStatus.Open)));
        using (var scope = factory.Services.CreateScope())
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .CreateCourtRentalAsync(new(member.UserId, 3, room, new(At(10)), new(At(11))), Guid.NewGuid().ToString(), member.UserId, default));
            Assert.Equal("room_under_incident_review", error.ErrorCode);
        }
        var resolve = request with { PreviewToken = preview.GetProperty("previewToken").GetString(), OperationId = Guid.NewGuid(), Refunds = [] };
        var done = await client.PostAsJsonAsync("/api/manager/incidents/resolve", resolve);
        Assert.True(done.IsSuccessStatusCode, await done.Content.ReadAsStringAsync());
        var retry = await client.PostAsJsonAsync("/api/manager/incidents/resolve", resolve);
        Assert.True(retry.IsSuccessStatusCode, await retry.Content.ReadAsStringAsync());
        Assert.Equal(await done.Content.ReadAsStringAsync(), await retry.Content.ReadAsStringAsync());
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room, At(10, 30), At(11, 30))), HttpStatusCode.Conflict, "incident_overlap");
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/resolve", Request(room, At(10, 30), At(11, 30))), HttpStatusCode.Conflict, "incident_overlap");
    }

    [Fact]
    public async Task Overlapping_rooms_and_center_are_rejected_but_adjacent_windows_and_other_rooms_are_allowed()
    {
        var room = await Room(); var otherRoom = await Room();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var otherManager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var other = factory.CreateApiClient(otherManager.UserId, UserRole.CenterManager);
        (await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room))).EnsureSuccessStatusCode();
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room, At(10, 30), At(11, 30))), HttpStatusCode.Conflict, "incident_overlap");
        await Error(await other.PostAsJsonAsync("/api/manager/incidents/preview", Request(room)), HttpStatusCode.Conflict, "incident_overlap");
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room) with { Scope = "CENTER", RoomId = null }), HttpStatusCode.Conflict, "incident_overlap");
        (await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(otherRoom))).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room, At(11), At(12)))).EnsureSuccessStatusCode();
        // A center-wide window also prevents a later room-specific review.
        (await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room, At(13).AddDays(10), At(14).AddDays(10)) with { Scope = "CENTER", RoomId = null })).EnsureSuccessStatusCode();
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/preview", Request(otherRoom, At(13, 30).AddDays(10), At(14, 30).AddDays(10))), HttpStatusCode.Conflict, "incident_overlap");
        var centerFence = await factory.QueryAsync(db => db.Set<IncidentFence>().Where(f => f.CreatedByUserId == manager.UserId && f.Scope == IncidentScope.Center).Select(f => f.FenceId).SingleAsync());
        (await client.PostAsync($"/api/manager/incidents/fences/{centerFence}/release", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Concurrent_overlapping_reviews_have_only_one_winner()
    {
        var room = await Room(); var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var results = await Task.WhenAll(client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room)),
            client.PostAsJsonAsync("/api/manager/incidents/preview", Request(room, At(10, 30), At(11, 30))));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<IncidentFence>().CountAsync(f => f.RoomId == room)));
    }

    [Theory]
    [InlineData(5, 59, 7, 0, 0)]
    [InlineData(21, 0, 22, 1, 0)]
    [InlineData(6, 0, 22, 0, 0)]
    [InlineData(0, 0, 5, 0, 0)]
    [InlineData(23, 0, 23, 59, 0)]
    [InlineData(21, 0, 7, 0, 1)]
    [InlineData(0, 0, 0, 0, 31)]
    public async Task Incident_allows_outside_hours_overnight_and_up_to_31_days(int sh, int sm, int eh, int em, int days)
    {
        var room = await Room(); var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = Request(room, At(sh, sm).AddDays(400), At(eh, em).AddDays(400 + days));
        var response = await client.PostAsJsonAsync("/api/manager/incidents/preview", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        var resolved = await client.PostAsJsonAsync("/api/manager/incidents/resolve", request with {
            PreviewToken = preview.GetProperty("previewToken").GetString(), OperationId = Guid.NewGuid(), Refunds = [] });
        Assert.True(resolved.IsSuccessStatusCode, await resolved.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Center_incident_can_span_closed_overnight_hours()
    {
        var room = await Room(); var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = Request(room, At(23).AddDays(200), At(5).AddDays(201)) with { Scope = "CENTER", RoomId = null };
        var response = await client.PostAsJsonAsync("/api/manager/incidents/preview", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        var resolved = await client.PostAsJsonAsync("/api/manager/incidents/resolve", request with {
            PreviewToken = preview.GetProperty("previewToken").GetString(), OperationId = Guid.NewGuid(), Refunds = [] });
        Assert.True(resolved.IsSuccessStatusCode, await resolved.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(0, -1)]
    [InlineData(31, 1)]
    public async Task Incident_rejects_empty_reversed_or_longer_than_31_day_ranges(int days, int minutes)
    {
        var room = await Room(); var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var request = Request(room, At(0), At(0).AddDays(days).AddMinutes(minutes));
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/preview", request), HttpStatusCode.BadRequest, "invalid_incident_range");
        await Error(await client.PostAsJsonAsync("/api/manager/incidents/resolve", request), HttpStatusCode.BadRequest, "invalid_incident_range");
        Assert.False(await factory.QueryAsync(db => db.Set<IncidentFence>().AnyAsync(f => f.RoomId == room)));
    }
}
