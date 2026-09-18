using System.Net;
using System.Net.Http.Json;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public class LoginRateLimitTests(SportHubApiFactory factory)
{
    // Moi test dung mot IP rieng -> partition rieng -> khong anh huong lan nhau.
    private const string ValidPassword = "CorrectHorse1";

    private HttpClient ClientFor(string ip)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, ip);
        return client;
    }

    private static HttpContent ValidDtoBody(string email)
        => JsonContent.Create(new { email, password = ValidPassword });

    private static HttpContent InvalidDtoBody()
        => JsonContent.Create(new { email = "not-an-email", password = "" });

    [Fact]
    public async Task Tenth_request_still_reaches_login_and_eleventh_is_rejected()
    {
        var client = ClientFor("10.10.0.1");

        for (var i = 1; i <= 10; i++)
        {
            // Email khac nhau moi lan -> chung minh quota tinh theo IP, khong theo email.
            var response = await client.PostAsync("api/auth/login", ValidDtoBody($"missing-{i}@example.com"));

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        var rejected = await client.PostAsync("api/auth/login", ValidDtoBody("missing-11@example.com"));

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/json", rejected.Content.Headers.ContentType?.MediaType);

        var body = await rejected.Content.ReadAsStringAsync();
        Assert.Contains("\"error\":\"too_many_requests\"", body);
        Assert.Contains("Too many login attempts", body);

        // FixedWindowRateLimiter co cung cap RetryAfter metadata -> header phai co mat.
        Assert.True(rejected.Headers.TryGetValues("Retry-After", out var retryAfter));
        Assert.True(int.Parse(retryAfter!.Single()) >= 1);
    }

    [Fact]
    public async Task Invalid_dto_requests_also_consume_quota()
    {
        var client = ClientFor("10.10.0.2");

        for (var i = 1; i <= 10; i++)
        {
            var response = await client.PostAsync("api/auth/login", InvalidDtoBody());

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        var rejected = await client.PostAsync("api/auth/login", ValidDtoBody("missing@example.com"));

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
    }

    [Fact]
    public async Task Rejected_request_never_reaches_repository_or_password_hasher()
    {
        var client = ClientFor("10.10.0.3");

        // Tieu het quota bang DTO sai: nhanh, va khong chay BCrypt.
        for (var i = 1; i <= 10; i++)
        {
            await client.PostAsync("api/auth/login", InvalidDtoBody());
        }

        factory.Spy.Reset();

        var rejected = await client.PostAsync("api/auth/login", ValidDtoBody("missing@example.com"));

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal(0, factory.Spy.FindByEmailCalls);
        Assert.Equal(0, factory.Spy.VerifyCalls);
        Assert.Equal(0, factory.Spy.VerifyDummyCalls);
    }

    [Fact]
    public async Task Different_ips_have_independent_quotas()
    {
        var exhausted = ClientFor("10.10.0.4");

        for (var i = 1; i <= 10; i++)
        {
            await exhausted.PostAsync("api/auth/login", InvalidDtoBody());
        }

        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await exhausted.PostAsync("api/auth/login", InvalidDtoBody())).StatusCode);

        var fresh = ClientFor("10.10.0.5");
        var response = await fresh.PostAsync("api/auth/login", ValidDtoBody("missing@example.com"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_quota_and_register_quota_are_independent()
    {
        var client = ClientFor("10.10.0.6");

        // auth-register cho phep 5/phut -> request thu 6 bi tu choi.
        for (var i = 1; i <= 5; i++)
        {
            await client.PostAsync("api/auth/register", InvalidDtoBody());
        }

        var registerRejected = await client.PostAsync("api/auth/register", InvalidDtoBody());
        Assert.Equal(HttpStatusCode.TooManyRequests, registerRejected.StatusCode);

        // Register da het quota nhung login van con nguyen quota cua no.
        var login = await client.PostAsync("api/auth/login", ValidDtoBody("missing@example.com"));
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        // ...va 429 cua register khong dung body cua login.
        var registerBody = await registerRejected.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Too many login attempts", registerBody);
    }

    [Fact]
    public async Task Successful_login_also_consumes_quota()
    {
        var email = $"quota-{Guid.NewGuid():N}@example.com";
        await factory.SeedUserAsync(email, ValidPassword);

        var client = ClientFor("10.10.0.7");

        for (var i = 1; i <= 10; i++)
        {
            var response = await client.PostAsync("api/auth/login", ValidDtoBody(email));

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var rejected = await client.PostAsync("api/auth/login", ValidDtoBody(email));

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
    }
}
