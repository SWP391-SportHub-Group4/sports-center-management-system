using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Audit.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class CourtRateAuditTests(SportHubApiFactory factory)
{
    private async Task<(HttpClient Client, SaveCourtRateRequest Input)> SetupAsync(UserRole role = UserRole.CenterManager)
    {
        var user = await factory.SeedUserAsync($"court-audit-{Guid.NewGuid():N}@example.com", null, role: role);
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(user.UserId, role));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var roomType = new RoomType { Name = $"Court \"snapshot\" {Guid.NewGuid():N}" };
        var sport = new Sport { Name = $"Sport {Guid.NewGuid():N}", Code = $"court_{Guid.NewGuid():N}"[..32],
            Services = [new SportServiceOffering { ServiceType = SportServiceType.CourtRental, IsEnabled = true }] };
        db.RoomTypes.Add(roomType);
        db.Sports.Add(sport);
        await db.SaveChangesAsync();
        db.SportRoomTypes.Add(new SportRoomType { RoomTypeId = roomType.RoomTypeId, SportId = sport.SportId });
        await db.SaveChangesAsync();
        return (client, new SaveCourtRateRequest {
            RoomTypeId = roomType.RoomTypeId, SportId = sport.SportId,
            DaysOfWeek = ["MON"], StartTimeLocal = "08:00", EndTimeLocal = "10:00", PricePerHour = 100000
        });
    }

    private async Task<AuditLog> EventAsync(int rateId, string action)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        return await db.AuditLogs.AsNoTracking().Where(a => a.TargetEntity == "CourtRate"
            && a.TargetId == rateId.ToString() && a.Action == action).OrderByDescending(a => a.Timestamp).FirstAsync();
    }

    [Fact]
    public async Task Create_and_update_record_complete_historical_snapshots_including_times_and_names()
    {
        var (client, input) = await SetupAsync();
        using (client)
        {
            var created = await client.PostAsJsonAsync("api/manager/court-rates", input);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var rate = (await created.Content.ReadFromJsonAsync<CourtRateResponse>())!;
            var createEvent = await EventAsync(rate.RateId, "CREATE_COURT_RATE");
            Assert.Null(createEvent.OldValue);
            using var snapshot = JsonDocument.Parse(createEvent.NewValue!);
            var old = snapshot.RootElement;
            Assert.Equal("08:00", old.GetProperty("startTimeLocal").GetString());
            Assert.Equal("10:00", old.GetProperty("endTimeLocal").GetString());
            Assert.Contains("\"snapshot\"", old.GetProperty("roomTypeName").GetString());
            Assert.StartsWith("Sport ", old.GetProperty("sportName").GetString());
            Assert.Equal(input.RoomTypeId, old.GetProperty("roomTypeId").GetInt32());
            Assert.Equal(input.SportId, old.GetProperty("sportId").GetInt32());
            Assert.Equal(100000, old.GetProperty("price").GetDecimal());

            input.PricePerHour = 200000;
            input.StartTimeLocal = "09:00";
            input.EndTimeLocal = "11:00";
            input.DaysOfWeek = ["WED", "MON"];
            input.SportId = null;
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"api/manager/court-rates/{rate.RateId}", input)).StatusCode);
            var updated = await EventAsync(rate.RateId, "UPDATE_COURT_RATE");
            Assert.Equal(createEvent.NewValue, updated.OldValue);
            using var next = JsonDocument.Parse(updated.NewValue!);
            Assert.Equal("09:00", next.RootElement.GetProperty("startTimeLocal").GetString());
            Assert.Equal("11:00", next.RootElement.GetProperty("endTimeLocal").GetString());
            Assert.Equal("MON,WED", next.RootElement.GetProperty("days").GetString());
            Assert.Equal(200000, next.RootElement.GetProperty("price").GetDecimal());
            Assert.Equal(JsonValueKind.Null, next.RootElement.GetProperty("sportId").ValueKind);
            Assert.True(next.RootElement.GetProperty("active").GetBoolean());

            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
                var roomType = await db.RoomTypes.FindAsync(input.RoomTypeId);
                roomType!.Name = $"Renamed today {Guid.NewGuid():N}";
                await db.SaveChangesAsync();
            }
            Assert.Equal(updated.NewValue, (await EventAsync(rate.RateId, "UPDATE_COURT_RATE")).NewValue);
        }
    }

    [Fact]
    public async Task Status_and_delete_preserve_price_window_and_nullable_sport()
    {
        var (client, input) = await SetupAsync();
        using (client)
        {
            input.SportId = null;
            var response = await client.PostAsJsonAsync("api/manager/court-rates", input);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var rate = (await response.Content.ReadFromJsonAsync<CourtRateResponse>())!;
            input.IsActive = false;
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"api/manager/court-rates/{rate.RateId}", input)).StatusCode);
            var updated = await EventAsync(rate.RateId, "UPDATE_COURT_RATE");
            using var old = JsonDocument.Parse(updated.OldValue!);
            using var next = JsonDocument.Parse(updated.NewValue!);
            Assert.True(old.RootElement.GetProperty("active").GetBoolean());
            Assert.False(next.RootElement.GetProperty("active").GetBoolean());
            Assert.Equal(old.RootElement.GetProperty("price").GetDecimal(), next.RootElement.GetProperty("price").GetDecimal());
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"api/manager/court-rates/{rate.RateId}")).StatusCode);
            var deleted = await EventAsync(rate.RateId, "DELETE_COURT_RATE");
            Assert.Equal(updated.NewValue, deleted.OldValue);
            Assert.Null(deleted.NewValue);
        }
    }

    [Fact]
    public async Task Invalid_update_does_not_write_a_success_event()
    {
        var (client, input) = await SetupAsync();
        using (client)
        {
            var created = await client.PostAsJsonAsync("api/manager/court-rates", input);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var rate = (await created.Content.ReadFromJsonAsync<CourtRateResponse>())!;
            input.PricePerHour = -1000;
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"api/manager/court-rates/{rate.RateId}", input)).StatusCode);
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            Assert.False(await db.AuditLogs.AnyAsync(a => a.TargetEntity == "CourtRate"
                && a.TargetId == rate.RateId.ToString() && a.Action == "UPDATE_COURT_RATE"));
            Assert.Equal(100000, (await db.CourtRates.FindAsync(rate.RateId))!.PricePerHour);
        }
    }
}
