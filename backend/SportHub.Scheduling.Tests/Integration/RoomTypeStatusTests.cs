using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Application;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class RoomTypeStatusTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Stop_blocks_new_reservations_preserves_bookings_and_individual_room_flags_on_reactivation()
    {
        var course = await CourseTestData.CreateAsync(factory);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var created = await manager.PostAsJsonAsync("api/manager/room-types", new { name = $"Type status {Guid.NewGuid():N}" });
        created.EnsureSuccessStatusCode();
        var typeId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("roomTypeId").GetInt32();
        var stoppedRoomId = await factory.QueryAsync(async db =>
        {
            db.SportRoomTypes.Add(new SportRoomType { RoomTypeId = typeId, SportId = 3 });
            (await db.Rooms.SingleAsync(r => r.RoomId == course.RoomId)).RoomTypeId = typeId;
            var room = new Room { Name = $"Stopped room {Guid.NewGuid():N}", RoomTypeId = typeId, Capacity = 10, IsActive = false };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            return room.RoomId;
        });
        var before = await CourseTestData.SessionsAsync(factory, course.Id);
        var stop = await manager.PostAsJsonAsync($"api/manager/room-types/{typeId}/discontinue", new { reason = "Retire this type" });
        stop.EnsureSuccessStatusCode();
        Assert.False((await stop.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("isActive").GetBoolean());
        Assert.False((await factory.QueryAsync(db => new SportCatalogReader(db, new SportHub.Administration.Infrastructure.SystemSettingProvider(db)).GetRoomAsync(course.RoomId)))!.IsActive);
        Assert.False(await factory.QueryAsync(db => new SportCatalogReader(db, new SportHub.Administration.Infrastructure.SystemSettingProvider(db)).IsRoomCompatibleAsync(course.RoomId, 3)));
        var slot = DateTime.UtcNow.Date.AddDays(1).AddHours(3);
        var free = await manager.GetFromJsonAsync<JsonElement>($"api/availability/rooms?sportId=3&startUtc={slot:O}&endUtc={slot.AddHours(1):O}");
        Assert.DoesNotContain(free.EnumerateArray(), x => x.GetProperty("roomId").GetInt32() == course.RoomId);
        var preview = await manager.GetFromJsonAsync<JsonElement>($"api/manager/class-schedule/availability?sportId=3&roomId={course.RoomId}&coachId={course.CoachId}&capacity=4&startUtc={slot:O}&endUtc={slot.AddHours(1):O}");
        Assert.False(preview.GetProperty("available").GetBoolean());
        Assert.Contains(preview.GetProperty("reasons").EnumerateArray(), x => x.GetString() == "room_type_inactive");
        var member = await factory.SeedUserAsync(UserRole.Member);
        using (var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member))
        {
            var calendar = await memberClient.GetFromJsonAsync<JsonElement>($"api/court-rentals/calendar?sportId=3&date={slot.AddHours(7):yyyy-MM-dd}&hours=1");
            Assert.DoesNotContain(calendar.GetProperty("rooms").EnumerateArray(), x => x.GetProperty("roomId").GetInt32() == course.RoomId);
        }
        using (var scope = factory.Services.CreateScope())
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => scope.ServiceProvider.GetRequiredService<CourtRentalService>()
                .QuoteAsync(new CourtRentalRequest(member.UserId, 3, course.RoomId, new DateTimeOffset(slot), new DateTimeOffset(slot.AddHours(1)))));
            Assert.Equal("rental_room_incompatible", error.ErrorCode);
        }
        await factory.QueryAsync(async db =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var start = new DateTimeOffset(2034, 1, 2, 3, 0, 0, TimeSpan.Zero);
            var error = await Assert.ThrowsAsync<ConflictException>(() => new OccupancyService(db, new TestClock(DateTime.UtcNow))
                .ReserveAsync(new OccupancyRequest(OccupancySources.ClassSession, Guid.NewGuid(), course.RoomId,
                    course.CoachId, start, start.AddHours(1))));
            Assert.Equal("room_type_inactive", error.ErrorCode);
            return 0;
        });
        Assert.Equal(ClassStatus.Published, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        var after = await CourseTestData.SessionsAsync(factory, course.Id);
        Assert.Equal(before.Select(s => (s.SessionId, s.StartAtUtc, s.EndAtUtc)), after.Select(s => (s.SessionId, s.StartAtUtc, s.EndAtUtc)));
        (await manager.PostAsJsonAsync($"api/manager/room-types/{typeId}/reactivate", new { reason = "Reopen this type" })).EnsureSuccessStatusCode();
        Assert.True((await factory.QueryAsync(db => new SportCatalogReader(db, new SportHub.Administration.Infrastructure.SystemSettingProvider(db)).GetRoomAsync(course.RoomId)))!.IsActive);
        Assert.False((await factory.QueryAsync(db => new SportCatalogReader(db, new SportHub.Administration.Infrastructure.SystemSettingProvider(db)).GetRoomAsync(stoppedRoomId)))!.IsActive);
        Assert.False(await factory.QueryAsync(db => db.Rooms.Where(r => r.RoomId == stoppedRoomId).Select(r => r.IsActive).SingleAsync()));
    }

    [Fact]
    public async Task Repeated_parallel_stop_is_idempotent_and_bad_reason_does_not_mutate()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var created = await manager.PostAsJsonAsync("api/manager/room-types", new { name = $"Parallel type {Guid.NewGuid():N}" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("roomTypeId").GetInt32();
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync($"api/manager/room-types/{id}/discontinue", new { reason = "   " })).StatusCode);
        Assert.True(await factory.QueryAsync(db => db.Set<RoomType>().Where(t => t.RoomTypeId == id).Select(t => t.IsActive).SingleAsync()));
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => manager.PostAsJsonAsync($"api/manager/room-types/{id}/discontinue", new { reason = "Parallel stop" })));
        Assert.All(results, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.TargetEntity == nameof(RoomType) && a.TargetId == id.ToString() && a.Action == "DISCONTINUE_ROOM_TYPE")));
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Only_manager_can_change_room_type_status(UserRole role)
    {
        var actor = await factory.SeedUserAsync(role);
        using var client = factory.CreateApiClient(actor.UserId, role);
        foreach (var action in new[] { "discontinue", "reactivate" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"api/manager/room-types/3/{action}", new { reason = "Not authorized" })).StatusCode);
    }
}
