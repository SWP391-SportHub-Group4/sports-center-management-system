using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CoachAvailabilityRequestTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Free_coaches_excludes_only_the_requested_scheduled_session()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var url = $"api/availability/coaches?sportId=3&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}";
        var busy = await manager.GetFromJsonAsync<FreeCoachResponse[]>(url);
        Assert.DoesNotContain(busy!, x => x.CoachId == c.CoachId);
        var own = await manager.GetFromJsonAsync<FreeCoachResponse[]>(url + $"&excludeSessionId={session.SessionId}");
        Assert.Contains(own!, x => x.CoachId == c.CoachId);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.GetAsync(url + $"&excludeSessionId={Guid.NewGuid()}")).StatusCode);

        var start = session.StartAtUtc.AddDays(1);
        var end = session.EndAtUtc.AddDays(1);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            Assert.True((await scope.ServiceProvider.GetRequiredService<IOccupancyService>().ReserveAsync(
                new(OccupancySources.ClassSession, Guid.NewGuid(), c.RoomId, c.CoachId, start.AddMinutes(30), end))).Succeeded);
            await tx.CommitAsync();
        }
        var overlap = await manager.GetFromJsonAsync<FreeCoachResponse[]>(
            $"api/availability/coaches?sportId=3&startUtc={start:O}&endUtc={end:O}&excludeSessionId={session.SessionId}");
        Assert.DoesNotContain(overlap!, x => x.CoachId == c.CoachId);
        var touching = await manager.GetFromJsonAsync<FreeCoachResponse[]>(
            $"api/availability/coaches?sportId=3&startUtc={end:O}&endUtc={end.AddMinutes(90):O}&excludeSessionId={session.SessionId}");
        Assert.Contains(touching!, x => x.CoachId == c.CoachId);
    }

    [Fact]
    public async Task Lookup_omits_inactive_and_wrong_sport_coaches()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var inactive = await factory.SeedUserAsync(UserRole.Coach, UserStatus.Banned);
        var wrongSport = await factory.SeedUserAsync(UserRole.Coach);
        var otherSportId = await factory.QueryAsync(async db => {
            var otherSport = new Sport { Code = "TEST-" + Guid.NewGuid().ToString("N"), Name = "Other test sport", IsActive = true };
            db.Set<Sport>().Add(otherSport);
            await db.SaveChangesAsync();
            db.Set<UserSportSpecialty>().AddRange(
                new UserSportSpecialty { UserId = inactive.UserId, SportId = 3 },
                new UserSportSpecialty { UserId = wrongSport.UserId, SportId = otherSport.SportId });
            await db.SaveChangesAsync(); return otherSport.SportId;
        });
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var list = await manager.GetFromJsonAsync<FreeCoachResponse[]>(
            $"api/availability/coaches?sportId=3&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}&excludeSessionId={session.SessionId}");
        Assert.Contains(list!, x => x.CoachId == c.CoachId);
        Assert.DoesNotContain(list!, x => x.CoachId == inactive.UserId || x.CoachId == wrongSport.UserId);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.GetAsync(
            $"api/availability/coaches?sportId={otherSportId}&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}&excludeSessionId={session.SessionId}")).StatusCode);
    }

    [Fact]
    public async Task Resolve_rechecks_a_coach_who_became_busy_after_lookup_and_preserves_pending()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var substitute = await CourseTestData.CreateAsync(factory, time: "12:00");
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var requestId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{session.SessionId}/change-requests",
            new CreateClassChangeRequest(requestId, "ABSENCE", "Unavailable for this session"))).StatusCode);
        var url = $"api/availability/coaches?sportId=3&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}&excludeSessionId={session.SessionId}";
        Assert.Contains((await manager.GetFromJsonAsync<FreeCoachResponse[]>(url))!, x => x.CoachId == substitute.CoachId);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            Assert.True((await scope.ServiceProvider.GetRequiredService<IOccupancyService>().ReserveAsync(
                new(OccupancySources.ClassSession, Guid.NewGuid(), substitute.RoomId, substitute.CoachId, session.StartAtUtc, session.EndAtUtc))).Succeeded);
            await tx.CommitAsync();
        }
        var result = await manager.PostAsJsonAsync($"api/manager/class-session-change-requests/{requestId}/resolve",
            new ResolveClassChangeRequest("SUBSTITUTE", "Arrange replacement coach", CoachId: substitute.CoachId));
        Assert.Equal(HttpStatusCode.Conflict, result.StatusCode);
        Assert.Equal("PENDING", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(x => x.RequestId == requestId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(c.CoachId, await factory.QueryAsync(db => db.Set<ClassSession>().Where(x => x.SessionId == session.SessionId).Select(x => x.CoachId).SingleAsync()));
        Assert.DoesNotContain((await manager.GetFromJsonAsync<FreeCoachResponse[]>(url))!, x => x.CoachId == substitute.CoachId);
    }

    [Theory]
    [InlineData("PLAN")]
    [InlineData("NOTICE")]
    public async Task Substitute_cannot_write_without_its_assigned_session(string kind)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var substitute = await factory.SeedUserAsync(UserRole.Coach);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        await factory.QueryAsync(db => db.Set<ClassSession>().Where(x => x.SessionId == sessions[0].SessionId)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.CoachId, substitute.UserId)));
        using var client = factory.CreateApiClient(substitute.UserId, UserRole.Coach);
        var url = $"api/coaches/me/teaching/classes/{c.Id}/records";
        var id = Guid.NewGuid();
        var missing = await client.PostAsJsonAsync(url, new { recordId = id, kind, title = "Scope check", content = "Assigned lesson only" });
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        Assert.Contains("class_plan_not_assigned", await missing.Content.ReadAsStringAsync());
        var noSession = await client.PostAsJsonAsync(url, new { recordId = id, kind, title = "Scope check", content = "Assigned lesson only", sessionId = (Guid?)null });
        Assert.Equal(HttpStatusCode.Forbidden, noSession.StatusCode);
        var personal = await client.PostAsJsonAsync(url, new { recordId = id, kind, title = "Scope check", content = "Assigned lesson only", memberId = member.UserId });
        Assert.Equal(HttpStatusCode.Forbidden, personal.StatusCode);
        Assert.Contains("class_plan_not_assigned", await personal.Content.ReadAsStringAsync());
        var wrong = await client.PostAsJsonAsync(url, new { recordId = id, kind, title = "Scope check", content = "Assigned lesson only", sessionId = sessions[1].SessionId });
        Assert.Equal(HttpStatusCode.Forbidden, wrong.StatusCode);
        Assert.Contains("session_not_assigned", await wrong.Content.ReadAsStringAsync());
        Assert.False(await factory.QueryAsync(db => db.Set<ClassTeachingRecord>().AnyAsync(x => x.RecordId == id)));
        var assigned = await client.PostAsJsonAsync(url, new { recordId = id, kind, title = "Scope check", content = "Assigned lesson only", sessionId = sessions[0].SessionId });
        Assert.Equal(HttpStatusCode.OK, assigned.StatusCode);
        Assert.Equal(sessions[0].SessionId, await factory.QueryAsync(db => db.Set<ClassTeachingRecord>().Where(x => x.RecordId == id).Select(x => x.SessionId).SingleAsync()));
        if (kind == "PLAN") {
            var missingOnEdit = await client.PutAsJsonAsync(url + $"/{id}", new { recordId = id, kind, title = "Updated", content = "Updated lesson", version = 1 });
            Assert.Equal(HttpStatusCode.Forbidden, missingOnEdit.StatusCode);
            var wrongOnEdit = await client.PutAsJsonAsync(url + $"/{id}", new { recordId = id, kind, title = "Updated", content = "Updated lesson", sessionId = sessions[1].SessionId, version = 1 });
            Assert.Equal(HttpStatusCode.Forbidden, wrongOnEdit.StatusCode);
            Assert.Equal(1, await factory.QueryAsync(db => db.Set<ClassTeachingRecord>().Where(x => x.RecordId == id).Select(x => x.Version).SingleAsync()));
            var correctEdit = await client.PutAsJsonAsync(url + $"/{id}", new { recordId = id, kind, title = "Updated", content = "Updated lesson", sessionId = sessions[0].SessionId, version = 1 });
            Assert.Equal(HttpStatusCode.OK, correctEdit.StatusCode);
        }
        using var primary = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await primary.PostAsJsonAsync(url, new { recordId = Guid.NewGuid(), kind, title = "Course content", content = "Primary coach may write course-wide content" })).StatusCode);
    }

    [Fact]
    public async Task Resolve_assigns_an_available_substitute_and_commits_the_outcome()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var substitute = await CourseTestData.CreateAsync(factory, time: "12:00");
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var choices = await manager.GetFromJsonAsync<FreeCoachResponse[]>(
            $"api/availability/coaches?sportId=3&startUtc={session.StartAtUtc:O}&endUtc={session.EndAtUtc:O}&excludeSessionId={session.SessionId}");
        Assert.Contains(choices!, x => x.CoachId == substitute.CoachId);
        var requestId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{session.SessionId}/change-requests",
            new CreateClassChangeRequest(requestId, "ABSENCE", "Unable to attend this lesson"))).StatusCode);
        var result = await manager.PostAsJsonAsync($"api/manager/class-session-change-requests/{requestId}/resolve",
            new ResolveClassChangeRequest("SUBSTITUTE", "Confirmed replacement for the whole lesson", CoachId: substitute.CoachId));
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Equal("RESOLVED", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(x => x.RequestId == requestId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(substitute.CoachId, await factory.QueryAsync(db => db.Set<ClassSession>().Where(x => x.SessionId == session.SessionId).Select(x => x.CoachId).SingleAsync()));
    }
}
