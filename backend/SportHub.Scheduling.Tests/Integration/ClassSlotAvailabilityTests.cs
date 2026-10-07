using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Occupancy.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassSlotAvailabilityTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Preview_excludes_only_its_own_session_and_does_not_reserve_or_write_audit()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var auditCount = await factory.QueryAsync(db => db.AuditLogs.CountAsync());
        var query = $"sportId=3&roomId={c.RoomId}&coachId={c.CoachId}&capacity=4&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}";
        using var withoutExclusion = JsonDocument.Parse(await manager.GetStringAsync("/api/manager/class-schedule/availability?" + query));
        Assert.False(withoutExclusion.RootElement.GetProperty("available").GetBoolean());
        using var excluded = JsonDocument.Parse(await manager.GetStringAsync("/api/manager/class-schedule/availability?" + query + "&excludeSessionId=" + session.SessionId));
        Assert.True(excluded.RootElement.GetProperty("available").GetBoolean());
        Assert.Empty(excluded.RootElement.GetProperty("reasons").EnumerateArray());
        Assert.False(string.IsNullOrWhiteSpace(excluded.RootElement.GetProperty("coachName").GetString()));
        Assert.Equal(auditCount, await factory.QueryAsync(db => db.AuditLogs.CountAsync()));
        Assert.Equal(3, await factory.QueryAsync(db => db.RoomOccupancies.CountAsync(o => o.RoomId == c.RoomId && o.IsActive)));
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.GetAsync("/api/manager/class-schedule/availability?" + query + "&excludeSessionId=" + Guid.NewGuid())).StatusCode);
        foreach (var role in new[] { UserRole.Member, UserRole.Coach, UserRole.Receptionist, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync(role);
            using var other = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync("/api/manager/class-schedule/availability?" + query)).StatusCode);
        }
    }

    [Fact]
    public async Task Preview_explains_room_coach_capacity_and_opening_hours_without_ignoring_other_sources()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var start = session.StartAtUtc.AddDays(1);
        var end = start.AddMinutes(90);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            Assert.True((await scope.ServiceProvider.GetRequiredService<IOccupancyService>().ReserveAsync(
                new(OccupancySources.PtSession, Guid.NewGuid(), c.RoomId, c.CoachId, start, end))).Succeeded);
            await tx.CommitAsync();
        }
        var occupied = await CourseTestData.RunAsync<AvailabilityService, ClassSlotAvailabilityResponse>(factory,
            s => s.CheckClassSlotAsync(3, c.RoomId, c.CoachId, 50, start, end, session.SessionId));
        Assert.False(occupied.Available);
        Assert.Contains("room_busy", occupied.Reasons);
        Assert.Contains("coach_busy", occupied.Reasons);
        Assert.Contains("room_capacity_exceeded", occupied.Reasons);
        await factory.QueryAsync(async db => { await db.RoomOpeningHours.Where(h => h.RoomId == c.RoomId).ExecuteDeleteAsync(); return 0; });
        var closed = await CourseTestData.RunAsync<AvailabilityService, ClassSlotAvailabilityResponse>(factory,
            s => s.CheckClassSlotAsync(3, c.RoomId, null, 4, start.AddDays(1), end.AddDays(1)));
        Assert.Contains("outside_opening_hours", closed.Reasons);
        Assert.Contains("coach_required", closed.Reasons);
    }
}
