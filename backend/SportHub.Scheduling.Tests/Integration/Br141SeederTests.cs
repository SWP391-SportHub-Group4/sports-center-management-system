using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Tests.Integration;

// Keep seeded classes and their future occupancies out of other scheduling test scenarios.
[CollectionDefinition(nameof(Br141SeedCollection))]
public sealed class Br141SeedCollection : ICollectionFixture<SchedulingApiFactory>;

[Collection(nameof(Br141SeedCollection))]
public sealed class Br141SeederTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Real_seed_command_publishes_four_classes_reserves_the_schedule_and_preserves_existing_data_on_retry()
    {
        Assert.Equal(0, await factory.QueryAsync(db => db.Classes.CountAsync())); // Startup never seeds.
        await factory.SeedUserAsync(UserRole.CenterManager);
        var seeded = await RunCommandAsync();
        Assert.True(seeded.ExitCode == 0, seeded.Output);
        var courses = await factory.QueryAsync(db => db.Classes.AsNoTracking().Include(c => c.Sessions)
            .Where(c => c.Code.StartsWith("BR141-")).OrderBy(c => c.Code).ToListAsync());
        Assert.Equal(4, courses.Count);
        Assert.Equal(new[] { "BR141-BONGRO-01", "BR141-BONGRO-02", "BR141-CAULONG-01", "BR141-CAULONG-02" },
            courses.Select(c => c.Code).OrderBy(c => c));
        foreach (var course in courses)
        {
            Assert.Equal(ClassStatus.Published, course.Status);
            Assert.True(course.EnrollmentOpen);
            Assert.Equal(12, course.Sessions.Count);
            var morning = course.Code.EndsWith("01");
            foreach (var session in course.Sessions)
            {
                var local = VietnamTime.ToLocal(session.StartAtUtc);
                Assert.Contains((int)local.DayOfWeek, morning ? new[] { 1, 3, 5 } : new[] { 2, 4, 6 });
                Assert.Equal(morning ? new TimeOnly(7, 0) : new TimeOnly(14, 0), TimeOnly.FromDateTime(local));
                Assert.Equal(TimeSpan.FromHours(2), session.EndAtUtc - session.StartAtUtc);
                Assert.Equal(course.DefaultRoomId, session.RoomId);
                Assert.Equal(course.CoachId, session.CoachId);
            }
        }
        Assert.Equal(4, courses.Select(c => c.DefaultRoomId).Distinct().Count());
        Assert.Equal(4, courses.Select(c => c.CoachId).Distinct().Count());
        var sessionIds = courses.SelectMany(c => c.Sessions).Select(s => s.SessionId).ToArray();
        Assert.Equal(48, await factory.QueryAsync(db => db.RoomOccupancies.CountAsync(o => sessionIds.Contains(o.SourceId) && o.IsActive)));
        Assert.Equal(48, await factory.QueryAsync(db => db.CoachOccupancies.CountAsync(o => sessionIds.Contains(o.SourceId) && o.IsActive)));
        using var client = factory.CreateApiClient();
        var catalog = await client.GetAsync("/api/classes?pageSize=100");
        Assert.Equal(HttpStatusCode.OK, catalog.StatusCode);
        using var publicJson = JsonDocument.Parse(await catalog.Content.ReadAsStringAsync());
        Assert.Equal(4, publicJson.RootElement.GetProperty("items").GetArrayLength());

        var first = courses[0].Sessions.OrderBy(s => s.SessionNo).First();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var occupancy = scope.ServiceProvider.GetRequiredService<IOccupancyService>();
            await using var tx = await db.Database.BeginTransactionAsync();
            var blocked = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.CourtRental,
                Guid.NewGuid(), first.RoomId, null, new DateTimeOffset(first.StartAtUtc), new DateTimeOffset(first.EndAtUtc)));
            Assert.False(blocked.Succeeded);
            Assert.Contains(blocked.Conflicts, c => c.ConflictSourceId == first.SessionId);
            var free = await occupancy.ReserveAsync(new OccupancyRequest(OccupancySources.CourtRental,
                Guid.NewGuid(), first.RoomId, null, new DateTimeOffset(first.EndAtUtc), new DateTimeOffset(first.EndAtUtc.AddHours(1))));
            Assert.True(free.Succeeded);
            await tx.RollbackAsync();
        }

        // Change operational data as a manager could; retry must not restore seed defaults.
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == courses[0].ClassId).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Name, "Manager renamed this class").SetProperty(c => c.Price, 1_500_000m)
                .SetProperty(c => c.EnrollmentOpen, false));
            await db.Set<SportHub.Scheduling.Catalog.Domain.CourtRate>().ExecuteUpdateAsync(s => s.SetProperty(r => r.PricePerHour, 333_000m));
            return 0;
        });
        var before = await SnapshotAsync();
        var retried = await RunCommandAsync();
        Assert.True(retried.ExitCode == 0, retried.Output);
        Assert.Equal(before, await SnapshotAsync());
        Assert.Equal(sessionIds.OrderBy(x => x), await factory.QueryAsync(db => db.ClassSessions.OrderBy(s => s.SessionId).Select(s => s.SessionId).ToArrayAsync()));

        // An existing booking must never be displaced to recreate a missing seed code.
        var missing = courses.Single(c => c.Code == "BR141-CAULONG-02");
        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == missing.ClassId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Code, "MANAGER-CUSTOM-BADMINTON")));
        before = await SnapshotAsync();
        var conflict = await RunCommandAsync();
        Assert.NotEqual(0, conflict.ExitCode);
        Assert.Contains("schedule conflicts", conflict.Output);
        Assert.Equal(before, await SnapshotAsync());
        Assert.Equal(48, await factory.QueryAsync(db => db.ClassSessions.CountAsync()));

        // Configurations already used by real classes require a manager decision, never an automatic rewrite.
        await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Catalog.Domain.SportServiceOffering>()
            .Where(o => o.SportId == missing.SportId && o.ServiceType == SportServiceType.GroupCourse)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.DefaultSessionMinutes, 90)));
        var incompatible = await RunCommandAsync();
        Assert.NotEqual(0, incompatible.ExitCode);
        Assert.Contains("120-minute", incompatible.Output);
        Assert.Equal(before, await SnapshotAsync());
        Assert.Equal(90, await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Catalog.Domain.SportServiceOffering>()
            .Where(o => o.SportId == missing.SportId && o.ServiceType == SportServiceType.GroupCourse)
            .Select(o => o.DefaultSessionMinutes).SingleAsync()));
    }

    [Theory]
    [InlineData("Production", false, "only available in Development")]
    [InlineData("Development", true, "must target a local database")]
    public async Task Seed_command_rejects_an_unsupported_environment_or_remote_database(string environment, bool remote, string error)
    {
        var result = await RunCommandAsync(environment, remote);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains(error, result.Output);
    }

    private async Task<string> SnapshotAsync() => await factory.QueryAsync(async db => JsonSerializer.Serialize(new
    {
        Classes = await db.Classes.AsNoTracking().OrderBy(c => c.ClassId).Select(c => new { c.ClassId, c.Code, c.Name, c.Price, c.CoachId, c.EnrollmentOpen }).ToListAsync(),
        Rates = await db.Set<SportHub.Scheduling.Catalog.Domain.CourtRate>().AsNoTracking().OrderBy(r => r.RateId).ToListAsync(),
        Users = await db.UserAccounts.AsNoTracking().OrderBy(u => u.UserId).Select(u => new { u.UserId, u.Email, u.Status }).ToListAsync(),
        Rooms = await db.Rooms.AsNoTracking().OrderBy(r => r.RoomId).Select(r => new { r.RoomId, r.Name, r.IsActive }).ToListAsync()
    }));

    private async Task<(int ExitCode, string Output)> RunCommandAsync(string environment = "Development", bool remote = false)
    {
        // Execute the real entry point against this fixture's isolated database, never the developer database.
        var connection = await factory.QueryAsync(db => Task.FromResult(db.Database.GetConnectionString()!));
        if (remote) connection = new NpgsqlConnectionStringBuilder(connection) { Host = "example.invalid" }.ConnectionString;
        var start = new ProcessStartInfo("dotnet") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var arg in new[] { typeof(Program).Assembly.Location, "--seed-br141=true", $"--environment={environment}",
            $"--ConnectionStrings:Default={connection}", "--Seed:Password=Br141-test-password!2026",
            $"--JwtOptions:SecretKey={SchedulingApiFactory.TestSecretKey}", "--JwtOptions:Issuer=SportHub.Api", "--JwtOptions:Audience=SportHub.Client",
            "--Smtp:FromAddress=integration-tests@example.invalid", "--Email:Smtp:FromAddress=integration-tests@example.invalid",
            "--Email:DemoLoggingEnabled=true", "--Logging:LogLevel:Default=Information",
            "--Logging:LogLevel:Microsoft.EntityFrameworkCore=Warning" }) start.ArgumentList.Add(arg);
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        return (process.ExitCode, await stdout + await stderr);
    }
}
