using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassCancellationPolicyContractTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task System_settings_expose_only_configurable_policy_and_reject_removed_key()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.GetAsync("api/system-settings");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        var keys = json.EnumerateArray().Select(item => item.GetProperty("key").GetString()).ToArray();
        Assert.Contains("package_expiring_reminder_days", keys);
        Assert.DoesNotContain("cancellation_deadline_hours", keys);

        var update = await client.PutAsJsonAsync(
            "api/system-settings/cancellation_deadline_hours",
            new { value = "12" });

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Contains("setting_not_found", await update.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Enrollment_contract_returns_fixed_thirty_minute_deadline_without_hours_snapshot()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var package = await factory.SeedMemberPackageAsync(member.UserId);
        var sessionStart = DateTime.UtcNow.AddHours(2);
        var sessionId = await SeedYogaSessionAsync(coach.UserId, sessionStart);
        var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var response = await client.PostAsJsonAsync(
            "api/enrollments",
            new { sessionId, memberPackageId = package.MemberPackageId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(SessionRules.CancellationDeadlineMinutes, json.GetProperty("cancellationDeadlineMinutes").GetInt32());
        Assert.False(json.TryGetProperty("cancellationDeadlineHours", out _));

        var deadline = json.GetProperty("cancellationDeadlineUtc").GetDateTime();
        // PostgreSQL timestamp precision is microseconds while DateTime carries 100 ns ticks.
        Assert.Equal(sessionStart.AddMinutes(-30), deadline, TimeSpan.FromMilliseconds(1));
    }

    [Fact]
    public async Task Migration_removes_obsolete_enrollment_column_and_setting_row()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var connection = db.Database.GetDbConnection();
        await connection.OpenAsync();

        await using var columnCommand = connection.CreateCommand();
        columnCommand.CommandText = """
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'enrollments'
              AND column_name = 'cancellation_deadline_hours';
            """;
        Assert.Equal(0L, Convert.ToInt64(await columnCommand.ExecuteScalarAsync()));

        Assert.False(await db.SystemSettings.AnyAsync(s => s.Key == "cancellation_deadline_hours"));
    }

    private async Task<Guid> SeedYogaSessionAsync(Guid coachId, DateTime startAtUtc)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var room = new Room
        {
            Name = $"Cancellation room {Guid.NewGuid():N}",
            Capacity = 20
        };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();

        var classEntity = new Class
        {
            Name = $"Cancellation class {Guid.NewGuid():N}",
            Discipline = Disciplines.Yoga,
            DefaultRoomId = room.RoomId,
            DefaultCoachId = coachId,
            Capacity = 20,
            Status = ClassStatus.Active
        };
        db.Classes.Add(classEntity);
        await db.SaveChangesAsync();

        var session = new ClassSession
        {
            SessionId = Guid.NewGuid(),
            ClassId = classEntity.ClassId,
            RoomId = room.RoomId,
            CoachId = coachId,
            StartAtUtc = startAtUtc,
            EndAtUtc = startAtUtc.AddHours(1),
            BaselineCapacity = 20,
            Capacity = 20,
            ConfirmedCount = 0,
            Status = ClassSessionStatus.Scheduled
        };
        db.ClassSessions.Add(session);
        await db.SaveChangesAsync();

        return session.SessionId;
    }
}
