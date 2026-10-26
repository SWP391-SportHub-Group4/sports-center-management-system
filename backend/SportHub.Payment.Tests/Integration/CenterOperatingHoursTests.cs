using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CenterOperatingHoursTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Configured_hours_guard_class_drafts_court_creation_and_court_hour_edits()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var original = await factory.QueryAsync(db => db.Set<SystemSetting>().AsNoTracking()
            .Where(s => s.Key == SystemSettingKeys.CenterOpeningMinutes || s.Key == SystemSettingKeys.CenterClosingMinutes)
            .ToDictionaryAsync(s => s.Key, s => s.Value));
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/system-settings/{SystemSettingKeys.CenterOpeningMinutes}", new { value = "480" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/system-settings/{SystemSettingKeys.CenterClosingMinutes}", new { value = "1200" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/system-settings/{SystemSettingKeys.CenterOpeningMinutes}", new { value = "1200" })).StatusCode);
            var data = await factory.QueryAsync(async db =>
            {
                var sport = new Sport { Code = "hours_" + Guid.NewGuid().ToString("N")[..12], Name = "Center hours " + Guid.NewGuid(), IsActive = true };
                var type = new RoomType { Name = "Hours type " + Guid.NewGuid(), IsActive = true };
                db.Set<Sport>().Add(sport); db.Set<RoomType>().Add(type);
                await db.SaveChangesAsync();
                db.Set<SportRoomType>().Add(new() { SportId = sport.SportId, RoomTypeId = type.RoomTypeId });
                db.Set<SportServiceOffering>().Add(new() { SportId = sport.SportId, ServiceType = SportHub.BuildingBlocks.Abstractions.Scheduling.SportServiceType.GroupCourse,
                    IsEnabled = true, DefaultSessionMinutes = 90, DefaultMaxCapacity = 12 });
                var room = new Room { Name = "Hours room " + Guid.NewGuid(), RoomTypeId = type.RoomTypeId, SportId = sport.SportId, Capacity = 12, IsActive = true, AllowRental = true };
                db.Set<Room>().Add(room); await db.SaveChangesAsync();
                return (sport.SportId, room.RoomId);
            });
            var date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10));
            object Course(string start) => new { code = "H" + Guid.NewGuid().ToString("N"), name = "Hours class", sportId = data.SportId,
                defaultRoomId = data.RoomId, startDate = date, numSessions = 1, capacity = 10, price = 100000, costAmount = 0,
                scheduleRules = new[] { new { dayOfWeek = (int)date.DayOfWeek, startTimeLocal = start } } };
            async Task Outside(HttpResponseMessage response)
            {
                Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
                var body = await response.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal("outside_center_hours", body.GetProperty("error").GetString());
            }
            await Outside(await client.PostAsJsonAsync("/api/manager/classes", Course("07:59")));
            await Outside(await client.PostAsJsonAsync("/api/manager/classes", Course("19:00")));
            var accepted = await client.PostAsJsonAsync("/api/manager/classes", Course("18:30"));
            Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync());
            var openingUrl = $"/api/manager/rooms/{data.RoomId}/opening-hours";
            object Hours(string open, string close) => new { hours = new[] { new { dayOfWeek = 1, openTimeLocal = open, closeTimeLocal = close } } };
            await Outside(await client.PutAsJsonAsync(openingUrl, Hours("07:00", "19:00")));
            await Outside(await client.PutAsJsonAsync(openingUrl, Hours("08:00", "21:00")));
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(openingUrl, Hours("08:00", "20:00"))).StatusCode);
            await Outside(await client.PostAsJsonAsync("/api/rooms/rental", new {
                name = "Outside court " + Guid.NewGuid(), capacity = 12, sportId = data.SportId,
                hours = new[] { new { dayOfWeek = 1, openTimeLocal = "07:00", closeTimeLocal = "20:00" } },
                rates = new[] { new { daysOfWeek = new[] { "MON" }, startTimeLocal = "07:00", endTimeLocal = "20:00", pricePerHour = 100000 } }
            }));
            // The same rejected time becomes valid after changing Settings; no restart or constants involved.
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/system-settings/{SystemSettingKeys.CenterClosingMinutes}", new { value = "1260" })).StatusCode);
            Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/manager/classes", Course("19:00"))).StatusCode);
        }
        finally
        {
            await factory.QueryAsync(async db =>
            {
                foreach (var row in original)
                    await db.Set<SystemSetting>().Where(s => s.Key == row.Key).ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, row.Value));
                return 0;
            });
        }
    }
}
