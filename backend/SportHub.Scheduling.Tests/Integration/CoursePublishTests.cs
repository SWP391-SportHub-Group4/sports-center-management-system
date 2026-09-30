using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CoursePublishTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Draft_is_private_publish_generates_all_sessions_and_occupancy_once()
    {
        var c = await CourseTestData.CreateAsync(factory, publish: false);
        var publicClient = factory.CreateApiClient();
        Assert.Equal(HttpStatusCode.NotFound, (await publicClient.GetAsync($"api/classes/{c.Id}")).StatusCode);
        var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => manager.PostAsJsonAsync($"api/manager/classes/{c.Id}/publish", new {})));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        Assert.Equal(3, sessions.Count);
        var ids = sessions.Select(s => s.SessionId).ToArray();
        Assert.Equal(3, await factory.QueryAsync(db => db.RoomOccupancies.CountAsync(o => ids.Contains(o.SourceId) && o.IsActive)));
        Assert.Equal(3, await factory.QueryAsync(db => db.CoachOccupancies.CountAsync(o => ids.Contains(o.SourceId) && o.IsActive)));
        Assert.Equal(1, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == c.CoachId && n.Message.Contains("đã được mở"))));
        var body = await publicClient.GetStringAsync($"api/classes/{c.Id}");
        Assert.DoesNotContain("costAmount", body);
        Assert.DoesNotContain("breakEvenThreshold", body);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PutAsJsonAsync($"api/manager/classes/{c.Id}", c.Request)).StatusCode);
    }

    [Fact]
    public async Task Conflict_in_last_session_rolls_back_entire_publish()
    {
        var c = await CourseTestData.CreateAsync(factory, publish: false);
        var start = new DateTime(2032, 3, 15, 2, 0, 0, DateTimeKind.Utc);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            var result = await scope.ServiceProvider.GetRequiredService<IOccupancyService>().ReserveAsync(
                new(OccupancySources.RoomBlock, Guid.NewGuid(), c.RoomId, null, start, start.AddHours(2)));
            Assert.True(result.Succeeded);
            await tx.CommitAsync();
        }
        var client = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"api/manager/classes/{c.Id}/publish", new {})).StatusCode);
        Assert.Empty(await CourseTestData.SessionsAsync(factory, c.Id));
        Assert.Equal(ClassStatus.Draft, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.Status).SingleAsync()));
        Assert.Equal(1, await factory.QueryAsync(db => db.RoomOccupancies.CountAsync(o => o.RoomId == c.RoomId && o.IsActive)));
        Assert.Equal(0, await factory.QueryAsync(db => db.CoachOccupancies.CountAsync(o => o.CoachId == c.CoachId && o.IsActive)));
        Assert.False(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == c.CoachId && n.Message.Contains("đã được mở"))));
    }

    [Theory]
    [InlineData("closed", "session_outside_opening_hours")]
    [InlineData("specialty", "coach_specialty_mismatch")]
    [InlineData("threshold", "threshold_exceeds_capacity")]
    public async Task Publish_revalidates_configuration(string change, string error)
    {
        var c = await CourseTestData.CreateAsync(factory, publish: false);
        await factory.QueryAsync(async db =>
        {
            if (change == "closed") await db.RoomOpeningHours.Where(x => x.RoomId == c.RoomId).ExecuteDeleteAsync();
            if (change == "specialty") await db.UserSportSpecialties.Where(x => x.UserId == c.CoachId).ExecuteDeleteAsync();
            if (change == "threshold") await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.CostAmount, 900_000));
            return 0;
        });
        var response = await factory.CreateApiClient(c.ManagerId, UserRole.CenterManager).PostAsJsonAsync($"api/manager/classes/{c.Id}/publish", new {});
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(error, await response.Content.ReadAsStringAsync());
        Assert.Empty(await CourseTestData.SessionsAsync(factory, c.Id));
    }

    [Fact]
    public async Task Reschedule_checks_member_conflicts_and_room_capacity_and_keeps_old_schedule()
    {
        var a = await CourseTestData.CreateAsync(factory);
        var b = await CourseTestData.CreateAsync(factory, time: "12:00");
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, a.Id, member.UserId);
        await CourseTestData.EnrollmentAsync(factory, b.Id, member.UserId);
        var original = (await CourseTestData.SessionsAsync(factory, a.Id))[0];
        var target = (await CourseTestData.SessionsAsync(factory, b.Id))[0];
        var ex = await Assert.ThrowsAsync<ConflictException>(() => CourseTestData.RunAsync<IClassSessionService, object>(factory,
            async s => await s.RescheduleAsync(original.SessionId, new() { StartAtUtc = target.StartAtUtc, Reason = "Đổi giờ" }, a.ManagerId)));
        Assert.Equal("member_schedule_conflict", ex.ErrorCode);
        var smallRoom = await CourseTestData.RoomAsync(factory, 1);
        var small = await Assert.ThrowsAsync<BadRequestException>(() => CourseTestData.RunAsync<IClassSessionService, object>(factory,
            async s => await s.RescheduleAsync(original.SessionId, new() { StartAtUtc = original.StartAtUtc, RoomId = smallRoom, Reason = "Đổi phòng" }, a.ManagerId)));
        Assert.Equal("capacity_exceeds_room", small.ErrorCode);
        Assert.Equal(original.StartAtUtc, (await CourseTestData.SessionsAsync(factory, a.Id))[0].StartAtUtc);
    }

    [Fact]
    public async Task Cancellation_creates_makeup_and_retains_enrollment_and_effective_session_count()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        var makeup = await CourseTestData.RunAsync<IClassSessionService, SportHub.Scheduling.Application.DTOs.ClassSessionResponse>(factory,
            s => s.CancelWithMakeupAsync(sessions[0].SessionId, new() { Reason = "Bảo trì sân", Makeup = new() { StartAtUtc = sessions[^1].StartAtUtc.AddDays(7) } }, c.ManagerId));
        Assert.True(makeup.IsMakeup);
        Assert.Equal(sessions[0].SessionId, makeup.RescheduledFromSessionId);
        Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, c.Id)).Count(s => s.Status != ClassSessionStatus.Cancelled));
        Assert.Equal(EnrollmentStatus.Confirmed, await factory.QueryAsync(db => db.Enrollments.Where(e => e.EnrollmentId == enrollment).Select(e => e.Status).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == sessions[0].SessionId && o.IsActive)));
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == makeup.SessionId && o.IsActive)));
    }
}
