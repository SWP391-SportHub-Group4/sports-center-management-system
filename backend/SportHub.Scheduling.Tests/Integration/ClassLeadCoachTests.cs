using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassLeadCoachTests(SchedulingApiFactory factory)
{
    private sealed record Candidate(Guid CoachId, string FullName);
    private sealed record Preview(int Version, int RemainingSessionCount, Candidate[] Coaches);
    private static string Url(int id) => $"api/manager/classes/{id}/lead-coach";

    private async Task<Guid> CoachAsync(bool specialty = true, UserStatus status = UserStatus.Active)
    {
        var coach = await factory.SeedUserAsync(UserRole.Coach, status);
        await factory.QueryAsync(async db => {
            db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
            if (specialty) db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 3 });
            await db.SaveChangesAsync(); return 0;
        });
        return coach.UserId;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Change_updates_remaining_sessions_occupancy_and_pending_requests(bool inProgress)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var replacement = await CoachAsync();
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        if (inProgress)
            await factory.QueryAsync(async db => {
                var first = await db.ClassSessions.SingleAsync(s => s.SessionId == before[0].SessionId);
                first.Status = ClassSessionStatus.Completed;
                var cls = await db.Classes.SingleAsync(x => x.ClassId == c.Id);
                cls.Status = ClassStatus.InProgress;
                await db.SaveChangesAsync(); return 0;
            });
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        var requestId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync(
            $"api/coaches/me/teaching/sessions/{before[^1].SessionId}/change-requests",
            new CreateClassChangeRequest(requestId, "ABSENCE", "Cannot teach remaining session"))).StatusCode);
        var preview = (await manager.GetFromJsonAsync<Preview>(Url(c.Id) + "/candidates"))!;
        Assert.Contains(preview.Coaches, x => x.CoachId == replacement);
        var response = await manager.PostAsJsonAsync(Url(c.Id), new { coachId = replacement, expectedVersion = preview.Version, reason = "Change class lead coach" });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(replacement, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.CoachId).SingleAsync()));
        var after = await CourseTestData.SessionsAsync(factory, c.Id);
        Assert.Equal(before.Select(s => s.StartAtUtc), after.Select(s => s.StartAtUtc));
        Assert.Equal(before.Select(s => s.RoomId), after.Select(s => s.RoomId));
        foreach (var session in after)
        {
            var expected = inProgress && session.SessionId == before[0].SessionId ? c.CoachId : replacement;
            Assert.Equal(expected, session.CoachId);
            Assert.True(await factory.QueryAsync(db => db.CoachOccupancies.AnyAsync(o => o.SourceId == session.SessionId && o.CoachId == expected && o.IsActive)));
        }
        Assert.Equal("WITHDRAWN", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == requestId).Select(r => r.Status).SingleAsync()));
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), new { coachId = replacement, expectedVersion = preview.Version, reason = "Retry stale change" })).StatusCode);
    }

    [Fact]
    public async Task Candidates_check_every_session_and_confirmation_rechecks_new_conflicts()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var replacement = await CoachAsync();
        var wrongSport = await CoachAsync(false);
        var inactive = await CoachAsync(status: UserStatus.Banned);
        var rows = await CourseTestData.SessionsAsync(factory, c.Id);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var preview = (await manager.GetFromJsonAsync<Preview>(Url(c.Id) + "/candidates"))!;
        Assert.Contains(preview.Coaches, x => x.CoachId == replacement);
        Assert.DoesNotContain(preview.Coaches, x => x.CoachId == c.CoachId || x.CoachId == wrongSport || x.CoachId == inactive);
        await factory.QueryAsync(async db => {
            db.CoachOccupancies.Add(new CoachOccupancy { OccupancyId = Guid.NewGuid(), CoachId = replacement,
                SourceType = OccupancySourceType.ClassSession, SourceId = Guid.NewGuid(),
                StartAtUtc = rows[^1].StartAtUtc, EndAtUtc = rows[^1].EndAtUtc });
            await db.SaveChangesAsync(); return 0;
        });
        var refreshed = (await manager.GetFromJsonAsync<Preview>(Url(c.Id) + "/candidates"))!;
        Assert.DoesNotContain(refreshed.Coaches, x => x.CoachId == replacement);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), new { coachId = replacement, expectedVersion = preview.Version, reason = "Stale availability" })).StatusCode);
        Assert.All(await CourseTestData.SessionsAsync(factory, c.Id), s => Assert.Equal(c.CoachId, s.CoachId));
        Assert.Equal(c.CoachId, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.CoachId).SingleAsync()));
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync(Url(c.Id), new { coachId = wrongSport, expectedVersion = preview.Version, reason = "Wrong specialty" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync(Url(c.Id), new { coachId = inactive, expectedVersion = preview.Version, reason = "Inactive coach" })).StatusCode);
    }

    [Fact]
    public async Task Coverage_distinguishes_lead_classes_from_substitute_sessions_and_refreshes_after_changes()
    {
        var lead = await CourseTestData.CreateAsync(factory);
        var other = await CourseTestData.CreateAsync(factory, time: "12:00");
        var substitute = (await CourseTestData.SessionsAsync(factory, other.Id))[0];
        var replacement = await CoachAsync();
        using var manager = factory.CreateApiClient(lead.ManagerId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync($"api/class-sessions/{substitute.SessionId}/reschedule",
            new { startAtUtc = substitute.StartAtUtc, coachId = lead.CoachId, reason = "Substitute assignment" })).StatusCode);
        await factory.QueryAsync(db => db.UserAccounts.Where(u => u.UserId == lead.CoachId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Banned)));
        var coverage = await manager.GetFromJsonAsync<System.Text.Json.JsonElement[]>("api/manager/coach-coverage");
        var row = Assert.Single(coverage!, x => x.GetProperty("coachId").GetGuid() == lead.CoachId);
        Assert.Single(row.GetProperty("mainClasses").EnumerateArray());
        Assert.Equal(3, row.GetProperty("sessions").EnumerateArray().Count(s => !s.GetProperty("isSubstitute").GetBoolean()));
        Assert.Single(row.GetProperty("sessions").EnumerateArray(), s => s.GetProperty("isSubstitute").GetBoolean()
            && s.GetProperty("sessionId").GetGuid() == substitute.SessionId);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync($"api/class-sessions/{substitute.SessionId}/reschedule",
            new { startAtUtc = substitute.StartAtUtc, coachId = replacement, reason = "Replace locked substitute" })).StatusCode);
        var preview = (await manager.GetFromJsonAsync<Preview>(Url(lead.Id) + "/candidates"))!;
        Assert.Equal(HttpStatusCode.NoContent, (await manager.PostAsJsonAsync(Url(lead.Id),
            new { coachId = replacement, expectedVersion = preview.Version, reason = "Replace locked lead" })).StatusCode);
        var after = await manager.GetFromJsonAsync<System.Text.Json.JsonElement[]>("api/manager/coach-coverage");
        Assert.DoesNotContain(after!, x => x.GetProperty("coachId").GetGuid() == lead.CoachId);
    }

    [Fact]
    public async Task Manager_only_and_active_class_only()
    {
        var c = await CourseTestData.CreateAsync(factory, publish: false);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Url(c.Id) + "/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Url(c.Id), new { coachId = Guid.NewGuid(), expectedVersion = 1, reason = "Unauthorized change" })).StatusCode);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        foreach (var status in new[] { ClassStatus.Draft, ClassStatus.Completed, ClassStatus.Cancelled })
        {
            await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, status)));
            Assert.Equal(HttpStatusCode.Conflict, (await manager.GetAsync(Url(c.Id) + "/candidates")).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), new { coachId = Guid.NewGuid(), expectedVersion = 1, reason = "Invalid class status" })).StatusCode);
        }
    }
}
