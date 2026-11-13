using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SportHub.API.Extensions;
using SportHub.API.Jobs;

namespace SportHub.Security.Tests.Unit;

public class SharedDatabaseStartupTests
{
    [Fact]
    public void Shared_instance_registers_no_application_workers()
    {
        var services = new ServiceCollection().AddSportHubBackgroundJobs(enabled: false);
        Assert.DoesNotContain(services, x => x.ServiceType == typeof(IHostedService));
        // HTTP endpoints can still resolve the services they normally share with jobs.
        Assert.Contains(services, x => x.ServiceType == typeof(MemberCourseNotificationService));
        Assert.Contains(services, x => x.ServiceType == typeof(SupportPayoutMaintenance));
    }

    [Fact]
    public void Regular_instance_keeps_scheduled_refunds_delivery_and_cleanup()
    {
        var services = new ServiceCollection().AddSportHubBackgroundJobs(enabled: true);
        var workers = services.Where(x => x.ServiceType == typeof(IHostedService))
            .Select(x => x.ImplementationType).ToArray();
        Assert.Contains(typeof(CenterCancellationAutoRefundJob), workers);
        Assert.Contains(typeof(NotificationDispatchJob), workers);
        Assert.Contains(typeof(CoachCredentialCleanupJob), workers);
        Assert.Contains(typeof(RoomOccupancyExpiryJob), workers);
        Assert.Contains(typeof(AvatarDeletionJob), workers);
    }

    [Theory]
    [InlineData("Production", "")]
    [InlineData("Development", "--seed-validation=true")]
    [InlineData("Development", "--seed-br141=true")]
    [InlineData("Development", "--bootstrap-initial-admin")]
    public async Task Shared_instance_rejects_production_or_explicit_database_initialization(string environment, string command)
    {
        using var api = StartApi(environment, command);
        var output = api.StandardOutput.ReadToEndAsync();
        var errors = api.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try
        {
            await api.WaitForExitAsync(timeout.Token);
            Assert.NotEqual(0, api.ExitCode);
            Assert.Contains("SharedDatabase:Enabled requires Development and forbids seed/bootstrap commands.",
                await output + await errors);
        }
        finally
        {
            if (!api.HasExited) api.Kill(entireProcessTree: true);
            await api.WaitForExitAsync();
        }
    }

    [Fact]
    public async Task Shared_instance_serves_health_without_migrating_or_seeding_an_unreachable_database()
    {
        using var api = StartApi("Development", "");
        var errors = api.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            string? address = null;
            while (await api.StandardOutput.ReadLineAsync(timeout.Token) is { } line)
            {
                const string marker = "Now listening on: ";
                var position = line.IndexOf(marker, StringComparison.Ordinal);
                if (position >= 0)
                {
                    address = line[(position + marker.Length)..].Trim();
                    break;
                }
            }
            Assert.True(address is not null, "API failed to start: " + (api.HasExited ? await errors : "startup timed out"));
            using var client = new HttpClient();
            var response = await client.GetAsync(address + "/api/health", timeout.Token);
            response.EnsureSuccessStatusCode();
            Assert.Contains("\"status\":\"ok\"", await response.Content.ReadAsStringAsync(timeout.Token));
        }
        finally
        {
            if (!api.HasExited) api.Kill(entireProcessTree: true);
            await api.WaitForExitAsync();
        }
    }

    private static Process StartApi(string environment, string command)
    {
        var dotnet = Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")
            ?? Path.GetFullPath(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(), "../../..",
                OperatingSystem.IsWindows() ? "dotnet.exe" : "dotnet"));
        var start = new ProcessStartInfo(dotnet)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        start.ArgumentList.Add(typeof(Program).Assembly.Location);
        start.ArgumentList.Add("--environment=" + environment);
        start.ArgumentList.Add("--SharedDatabase:Enabled=true");
        // No shared or developer database is ever used by these subprocesses.
        start.ArgumentList.Add("--ConnectionStrings:Default=Host=127.0.0.1;Port=1;Database=unreachable;Username=test;Password=test;Timeout=1");
        start.ArgumentList.Add("--JwtOptions:SecretKey=shared-db-startup-test-secret-at-least-32-characters");
        start.ArgumentList.Add("--Email:Provider=Smtp");
        start.ArgumentList.Add("--Smtp:Host=");
        start.ArgumentList.Add("--Smtp:FromAddress=tests@example.invalid");
        start.ArgumentList.Add("--Email:Smtp:Host=");
        start.ArgumentList.Add("--Email:Smtp:FromAddress=tests@example.invalid");
        start.ArgumentList.Add("--DataProtection:KeysPath=");
        start.ArgumentList.Add("--Logging:LogLevel:Microsoft.Hosting.Lifetime=Information");
        start.ArgumentList.Add("--urls=http://127.0.0.1:0");
        if (command.Length > 0) start.ArgumentList.Add(command);
        return Process.Start(start)!;
    }
}
