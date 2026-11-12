using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.API.Jobs;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CompletedClassCodeTests(SchedulingApiFactory factory)
{
    private async Task RunJobAsync()
    {
        using var scope = factory.Services.CreateScope();
        var job = new ClassStatusJob(factory.Services, NullLogger<ClassStatusJob>.Instance);
        await (Task)typeof(ClassStatusJob).GetMethod("RunOnceAsync", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(job, [scope.ServiceProvider, CancellationToken.None])!;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Completion_archives_new_and_legacy_codes_once_using_the_last_delivered_Vietnam_date(bool legacy)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        // 19:30 UTC is the following calendar day in Vietnam. The later cancelled
        // session must not determine the course's completion date.
        var lastEnd = new DateTime(2025, 11, 15, 19, 30, 0, DateTimeKind.Utc);
        await factory.QueryAsync(async db =>
        {
            for (var i = 0; i < sessions.Count; i++)
            {
                var end = lastEnd.AddDays(i == sessions.Count - 1 ? 10 : i - (sessions.Count - 2));
                var id = sessions[i].SessionId;
                await db.ClassSessions.Where(s => s.SessionId == id).ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.StartAtUtc, end.AddHours(-1))
                    .SetProperty(x => x.EndAtUtc, end)
                    .SetProperty(x => x.Status, i == sessions.Count - 1
                        ? ClassSessionStatus.Cancelled
                        : legacy ? ClassSessionStatus.Completed : ClassSessionStatus.Scheduled));
            }
            return await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, legacy ? ClassStatus.Completed : ClassStatus.InProgress));
        });

        await RunJobAsync();
        var first = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(c => c.ClassId == course.Id));
        Assert.Equal(ClassStatus.Completed, first.Status);
        Assert.Equal($"{course.Request.Code.ToUpperInvariant()} Complete 16/11/25", first.Code);
        var ids = (await CourseTestData.SessionsAsync(factory, course.Id)).Select(s => s.SessionId).Order();
        Assert.Equal(sessions.Select(s => s.SessionId).Order(), ids);
        await RunJobAsync();
        var again = await factory.QueryAsync(db => db.Classes.AsNoTracking().SingleAsync(c => c.ClassId == course.Id));
        Assert.Equal(first.Code, again.Code);
        Assert.Equal(first.Version, again.Version);

        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var created = await manager.PostAsJsonAsync("api/manager/classes", course.Request);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Drafts_keep_their_code_and_cannot_claim_a_completion_suffix()
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        await RunJobAsync();
        Assert.Equal(course.Request.Code.ToUpperInvariant(), await factory.QueryAsync(db =>
            db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Code).SingleAsync()));
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        course.Request.Code += " Complete 16/11/25";
        var response = await manager.PostAsJsonAsync("api/manager/classes", course.Request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
