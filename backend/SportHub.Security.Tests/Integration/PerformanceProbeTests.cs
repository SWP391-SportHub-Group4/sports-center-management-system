using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Security;
using Xunit.Abstractions;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Do overhead cua hai thay doi trong task (dummy BCrypt tren nhanh login that bai,
/// va query IsActiveAsync tren moi request da xac thuc) de doi chieu BR-35 (&lt;= 200 ms
/// trung binh cho API tieu chuan).
///
/// KHONG co assertion thoi gian tuyet doi: so lieu phu thuoc phan cung va khong on dinh
/// trong CI. Probe chi chay khi dat bien moi truong SPORTHUB_RUN_PERF=1, va chi in ket qua.
/// Chay:  SPORTHUB_RUN_PERF=1 dotnet test --filter FullyQualifiedName~PerformanceProbe
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public class PerformanceProbeTests(SportHubApiFactory factory, ITestOutputHelper output)
{
    private const int Warmup = 5;
    private const int Iterations = 30;

    private static bool Enabled => Environment.GetEnvironmentVariable("SPORTHUB_RUN_PERF") == "1";

    /// <summary>
    /// Moi request mot IP khac nhau -> moi request mot partition rate limit rieng, nen
    /// quota 10/phut cua production khong bop meo so do. Khong ha quota, khong do 429.
    /// </summary>
    private HttpClient ClientForIteration(int i)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.99.{i / 250 % 250}.{i % 250}");
        return client;
    }

    private static (double Mean, double P95) Summarize(List<double> samples)
    {
        samples.Sort();
        var p95Index = (int)Math.Ceiling(samples.Count * 0.95) - 1;
        return (samples.Average(), samples[Math.Clamp(p95Index, 0, samples.Count - 1)]);
    }

    private async Task<(double Mean, double P95)> MeasureAsync(Func<int, Task> action)
    {
        for (var i = 0; i < Warmup; i++)
        {
            await action(i);
        }

        var samples = new List<double>(Iterations);

        for (var i = 0; i < Iterations; i++)
        {
            var sw = Stopwatch.StartNew();
            await action(Warmup + i);
            sw.Stop();
            samples.Add(sw.Elapsed.TotalMilliseconds);
        }

        return Summarize(samples);
    }

    private void Report(string label, (double Mean, double P95) result)
        => output.WriteLine($"{label,-46} mean {result.Mean,7:F1} ms   p95 {result.P95,7:F1} ms");

    [Fact]
    public async Task Measure_login_and_protected_endpoint_latency()
    {
        if (!Enabled)
        {
            output.WriteLine("Bo qua: dat SPORTHUB_RUN_PERF=1 de chay probe hieu nang.");
            return;
        }

        var email = $"perf-{Guid.NewGuid():N}@example.com";
        const string password = "CorrectHorse1";
        var user = await factory.SeedUserAsync(email, password);
        var token = factory.IssueToken(user.UserId, UserRole.Member);

        output.WriteLine($"iterations={Iterations} (warm-up={Warmup}), concurrency=1 (tuan tu)");
        output.WriteLine($"OS={Environment.OSVersion}, logical CPUs={Environment.ProcessorCount}");
        output.WriteLine("DB=PostgreSQL 16-alpine qua Testcontainers, BCrypt cost=11 (mac dinh BCrypt.Net-Next 4.2.0)");
        output.WriteLine(new string('-', 92));

        // (A) Nhanh truoc day KHONG chay BCrypt — gio chay VerifyDummy. Day la cho overhead tang.
        Report("login: email khong ton tai (VerifyDummy)", await MeasureAsync(async i =>
            await ClientForIteration(i).PostAsync("api/auth/login",
                JsonContent.Create(new { email = $"missing-{i}@example.com", password }))));

        // (B) Nhanh truoc va sau deu chay 1 BCrypt Verify — moc so sanh.
        Report("login: sai password (Verify that)", await MeasureAsync(async i =>
            await ClientForIteration(i).PostAsync("api/auth/login",
                JsonContent.Create(new { email, password = "WrongPassword1" }))));

        Report("login: thanh cong", await MeasureAsync(async i =>
            await ClientForIteration(i).PostAsync("api/auth/login",
                JsonContent.Create(new { email, password }))));

        // (C) Endpoint protected tieu chuan — gio them 1 query IsActiveAsync moi request.
        Report("GET endpoint protected (co check BR-6)", await MeasureAsync(async i =>
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "api/__tests/protected");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            await ClientForIteration(i).SendAsync(request);
        }));

        output.WriteLine(new string('-', 92));

        // Tach rieng hai thanh phan overhead do task nay them vao.
        var hasher = new PasswordHasher();
        Report("  thanh phan: BCrypt VerifyDummy don le", await MeasureAsync(_ =>
        {
            hasher.VerifyDummy(password);
            return Task.CompletedTask;
        }));

        Report("  thanh phan: query IsActiveAsync don le", await MeasureAsync(async _ =>
        {
            using var scope = factory.Services.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<IUserAccountRepository>();
            await repository.IsActiveAsync(user.UserId);
        }));

        output.WriteLine(new string('-', 92));
        output.WriteLine("BR-35: doi chieu 'mean' voi nguong 200 ms. Neu vuot, bao la chua dat tai moi truong do —");
        output.WriteLine("KHONG ha BCrypt cost va KHONG bo query IsActiveAsync de lam dep so lieu.");
    }
}
